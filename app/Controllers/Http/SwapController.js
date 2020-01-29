'use strict'

const { validate } = use('Validator')
const BtcWalletController = use('App/Services/BtcWalletController')
const Logger = use('Logger')
const Swapinvoice = use('App/Models/Swapinvoice')
var Env = use('Env')

var validateAddress = require('bitcoin-address-validation');
var grpc = require('grpc');
var protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = __dirname + '/client.proto';
var packageDefinition = protoLoader.loadSync(
  PROTO_PATH,
  {
     keepCase: true,
     longs: String,
     enums: String,
     defaults: true,
     oneofs: true
  },
);
var looprpc = grpc.loadPackageDefinition(packageDefinition).looprpc;



class SwapController {

  constructor(){
    if(this.wallet === undefined)
      this.wallet = new BtcWalletController()
    if(this.swapClient === undefined){
      this.swapClient = new looprpc.SwapClient('localhost:11010', grpc.credentials.createInsecure());
      var request = {}
      var call = this.swapClient.monitor(request)
      call.on('data', function(response) {
        // A response was received from the server.
        //console.log("as I suspected")
        //console.log(response)
        var promise = Swapinvoice.findBy('swapid', response['id']).then(invoice => {
          if(!invoice){
            // Recieved irrelevant swap
            return
          }
          if(invoice.status != response['state']){
            invoice.status = response['state']
            invoice.cost_server = response['cost_server']
            invoice.cost_onchain = response['cost_onchain']
            invoice.cost_offchain = response['cost_offchain']
            invoice.save()
          }
        }, reason => {
          Logger.crit("unexpected error")
          Logger.crit(reason)
        })
      });
      call.on('status', function(status) {
        // The current status of the stream.
      });
      call.on('end', function() {
        // The server has closed the stream.
      });
      call.on('error', function(e) {
        switch(e['code']) {
          case 14:
            // Couldn't connect to loop Daemon
            Logger.crit("Couldn't connect to loop Daemon")
            // We should disable the loop page.
            break;
          default:
            Logger.crit("Unhandled error in Loop Daemon.")
            Logger.crit(e)
        }
        return
      });
    }
  }

  async loop ({ view }) {
    return view.render(`swap.index`)
  }

  async swap ({ view }) {
    return view.render(`swap.swap`)
  }

  async requestSwapRefund ({response, session, request}){
    const url = request.url()
    const validation = await validate(request.all(), {
      lnInvoice: 'required'
    })

    if(validation.fails()) {
      session.withErrors(validation.messages())
              .flashAll()
      return response.redirect('back')
    }

    const lnInvoice = request.input('lnInvoice')
    const invoiceID = url.split("/")[2]
    const swap = await Swapinvoice.find(invoiceID)
    if(!swap){
      session.flash({ error: "Could not find invoice!"})
      return response.redirect('back')
    }

    if(swap.status != "FAILED" && swap.status != "SUCCESS"){
      return response.redirect('back')
    }

    var cost_server = swap.cost_server
    var cost_onchain = swap.cost_onchain 
    var cost_offchain = swap.cost_offchain
    var totalFees = (cost_server + cost_onchain + cost_offchain)

    var satsRequested = swap.satsRequested
    var satsPaid = swap.satsPaid
    if(swap.status == "FAILED"){
      var excess = (satsPaid)
    } else {
      var excess = (satsPaid - satsRequested)
    }
    
    
    var baseFee = swap.fee
    const total = (excess - totalFees) - baseFee
    try{
      const decoded = await this.wallet.decodePaymentRequest(lnInvoice)
      if(decoded['num_satoshis']==0 || decoded['num_satoshis'] <= total){
        const payResult = await this.wallet.payInvoice(lnInvoice, total, 0)
        //Logger.crit("pay result!!")
        //console.log(payResult)
        if(payResult["payment_error"] == ""){
          swap.refunded = true
          await swap.save()
          session.flash({ error: "Payment complete. Thank you!"})
          return response.redirect('back')
        }
      } else {
        session.flash({ error: "Amount requested in the invoice is too high! Max withdraw: " + total + " Satoshis"})
        return response.redirect('back')
      }
    } catch (err) {
      Logger.crit(err)
      session.flash({ error: "Could not read the invoice."})
      return response.redirect('back')
    }
  }

  calculateTotalFees(requestedSats){
    var maxMinerFee = Number(Env.get('SWAP_MAX_MINER_FEE'))
    var maxPrepaymentAmt = Number(Env.get('SWAP_MAX_PREPAY_AMT'))
    var maxSwapFee = Number(Env.get('SWAP_MAX_SWAP_FEE'))
    var maxPrepayRoutingFee = maxPrepaymentAmt * Number(Env.get('SWAP_ROUTING_FEE_RATIO'))
    var maxSwapRoutingFee = Number(requestedSats) * Number(Env.get('SWAP_ROUTING_FEE_RATIO'))
    var baseFee = Number(Env.get('SWAP_BASE_FEE'))

    const total =  Math.round(maxPrepayRoutingFee + maxSwapRoutingFee + maxMinerFee + maxSwapFee + baseFee)
    return total
  }

  async requestSwapOut ({view, request, response, session }) {
    const validation = await validate(request.all(), {
      liquidity: 'required|range:0.00249999,0.02000001',
      address: 'required'
    })
    // show error messages upon validation fail
    if (validation.fails()) {
      Logger.info(request.all()['liquidity'])
      session.withErrors(validation.messages())
              .flashAll()
      return response.redirect('back')
    }
    const returnAddress = request.input('address')
    if(request.input('address') && !validateAddress(returnAddress)){
      session
      .withErrors([{ field: 'notification', message: 'Invalid Bitcoin Address.' }])
      .flashAll()
      return response.redirect('back')
    }

    const requestedSats =  Math.round((request.input('liquidity') * 100000000))
    const totalInvoice = requestedSats + await this.calculateTotalFees(requestedSats)

    var invoiceId = await this.wallet.addInvoice(totalInvoice, `RC SWAP ${requestedSats} OFF ${returnAddress}`)
    const swapId = await this.createSwapRecord(invoiceId, returnAddress, totalInvoice, requestedSats)
    var result = this.wallet.resolveOnInvoice()
    result.then(this.handleInvoiceStatus(result))
    return response.redirect('/swapstatus/' + swapId)
  }
  

  async createSwapRecord(invoice, address, totalCost, requested){
    const swap = new Swapinvoice()
    swap.invoice = invoice['payment_request']
    swap.returnAddress = address
    swap.addIndex = invoice['add_index']
    swap.r_hash = invoice['r_hash']
    swap.satsRequested = requested
    swap.satsPaid = totalCost
    swap.paid = false
    swap.refunded = false
    swap.fee = Env.get('SWAP_BASE_FEE')
    await swap.save()
    return swap.id
  }

  async handleInvoiceStatus(status){
    var result = await status

    if(!result){
      return
    }

    if(result["state"] === "SETTLED"){
      //await Swapinvoice.query().where({'invoice': result['payment_request'], 'addIndex': result['add_index']}).update({
      //  paid: true
      //})
      await Swapinvoice.query().where({'r_hash': result['r_hash']}).update({
        paid: true
      })

      //var swapRecord = await Swapinvoice.query().where({'invoice': result['payment_request'], 'addIndex': result['add_index']}).first()
      var swapRecord = await Swapinvoice.findBy('r_hash', result['r_hash'])
      if(!swapRecord){
        // Couldn't find swap record
        return
      }
      await this.initiateSwap(swapRecord.id)
    } else {
      //Logger.crit(result)
      //Logger.crit(`Unhandled invoice status!`)
      //await Swapinvoice.query().where({'invoice': result['payment_request'], 'addIndex': result['add_index']}).delete() // This could very well be a bug! TODO
    }
    return
  }

  async initiateSwap(id){
    var swapRecord = await Swapinvoice.find(id)
    if(!swapRecord){
      return Error("Unable to find swap invoice record")
    }

    var maxMinerFee = Env.get('SWAP_MAX_MINER_FEE')
    var maxPrepaymentAmt = Env.get('SWAP_MAX_PREPAY_AMT')
    var maxSwapFee = Env.get('SWAP_MAX_SWAP_FEE')
    var maxPrepayRoutingFee = Env.get('MAX_ROUTING_FEE_PREPAY') //maxPrepaymentAmt * Number(Env.get('SWAP_ROUTING_FEE_RATIO'))
    var maxSwapRoutingFee = Env.get('MAX_ROUTING_FEE_SWAP') //Number(swapRecord.satoshis) * Number(Env.get('SWAP_ROUTING_FEE_RATIO'))

    var request = { 
      amt: swapRecord.satsRequested, 
      dest: swapRecord.returnAddress, 
      max_swap_routing_fee: maxSwapRoutingFee, 
      max_prepay_routing_fee: maxPrepayRoutingFee, 
      max_swap_fee: maxSwapFee, 
      max_prepay_amt: maxPrepaymentAmt, 
      max_miner_fee: maxMinerFee, 
      loop_out_channel: null, 
      sweep_conf_target: 3, 
      swap_publication_deadline: this.addMinutes(Date.now(), 30).getTime() / 1000
    }

    this.swapClient.loopOut(request, function(err, response, swap = swapRecord) {
      if(err){
        swap.failed = true
        swap.save()
      } else {
        swap.swapid = response['id']
        swap.htlc_address = response['htlc_address']
        swap.save()
      }
    })
  }

  async swapStatus({view, request, response}){
    const swapId = request.url().split("/")[2]
    const swap = await Swapinvoice.find(swapId)
    /*
      note to self, this should be redone such that 
      each different possibility (!swap, swap.paid)
      renders a different page. 
    */

    if(!swap){
      Logger.error(`Couldn't find swap ${swapId}`)
      return view.render(`swap.invoice`, {swap: null, quote: null})
    }

    if(swap.paid){
      return view.render(`swap.invoice`, {swap: swap}) 
    }

    const total = this.calculateTotalFees(swap.satsRequested)
    return view.render(`swap.invoice`, {swap: swap, quote: total })
  }

  addMinutes(date, minutes) {
    return new Date(date + minutes*60000);
  }

}

module.exports = SwapController
