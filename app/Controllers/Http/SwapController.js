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
    this.wallet = new BtcWalletController()
    this.swapClient = new looprpc.SwapClient('localhost:11010', grpc.credentials.createInsecure());
    var request = {}
    var call = this.swapClient.monitor(request)
    call.on('data', function(response) {
      // A response was received from the server.
      Logger.debug("update from swap server: ")
      Logger.debug(response);
    });
    call.on('status', function(status) {
      // The current status of the stream.
    });
    call.on('end', function() {
      // The server has closed the stream.
    });
  }

  async index ({ view, request }) {
    return view.render(`swap.index`)
  }

  async calculateTotalFees(requestedSats){
    var maxMinerFee = Env.get('SWAP_MAX_MINER_FEE')
    var maxPrepaymentAmt = Env.get('SWAP_MAX_PREPAY_AMT')
    var maxSwapFee = Env.get('SWAP_MAX_SWAP_FEE')
    var maxPrepayRoutingFee = maxPrepaymentAmt * Number(Env.get('SWAP_ROUTING_FEE_RATIO'))
    var maxSwapRoutingFee = Number(requestedSats) * Number(Env.get('SWAP_ROUTING_FEE_RATIO'))

    var request = { 
      amt: requestedSats, 
      conf_target: 3, 
      external_htlc: false, 
    }
    var promise = new Promise((resolve, reject) => {
      var swapClient = new looprpc.SwapClient('localhost:11010', grpc.credentials.createInsecure());
      swapClient.loopOutQuote(request, function(err, response) {
        if(err){
          reject(Error(err))
        }
        resolve(response)
      })
    })
    var result = await promise
    var maxMinerFee = Env.get('SWAP_MAX_MINER_FEE')
    var maxPrepaymentAmt = Env.get('SWAP_MAX_PREPAY_AMT')
    var maxSwapFee = Env.get('SWAP_MAX_SWAP_FEE')
    var totalServiceFees = Number(result["swap_fee"]) + Number(result["prepay_amt"]) + Number(result["miner_fee"])

    var maxPrepayRoutingFee = maxPrepaymentAmt * Number(Env.get('SWAP_ROUTING_FEE_RATIO'))
    var maxSwapRoutingFee = Number(requestedSats) * Number(Env.get('SWAP_ROUTING_FEE_RATIO'))

    const total =  Math.round(totalServiceFees + maxPrepayRoutingFee + maxSwapRoutingFee + Number(Env.get('SWAP_BASE_FEE')))
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

    
    await this.wallet.connectToLnd()
    await this.wallet.unlockLndWallet()

    const requestedSats =  Math.round((request.input('liquidity') * 100000000))
    const totalInvoice = requestedSats + await this.calculateTotalFees(requestedSats)

    var invoiceId = await this.wallet.addInvoice(totalInvoice, `RC SWAP ${requestedSats} OFF ${returnAddress}`)
    const swapId = await this.createSwapRecord(invoiceId, returnAddress, requestedSats)
    var result = this.wallet.resolveOnInvoice()
    result.then(this.handleInvoiceStatus(result))
    return response.redirect('/swapstatus/' + swapId)
  }
  

  async createSwapRecord(invoice, address, satoshis){
    const swap = new Swapinvoice()
    console.log(invoice)
    swap.invoice = invoice['payment_request']
    swap.returnAddress = address
    swap.addIndex = invoice['add_index']
    swap.r_hash = invoice['r_hash']
    swap.satoshis = satoshis
    swap.paid = false
    swap.failed = false
    await swap.save()
    return swap.id
  }

  async handleInvoiceStatus(status){
    var result = await status

    if(!result){
      Logger.debug("Invoice status is null.")
      return
    }

    if(result["state"] === "SETTLED"){
      //Logger.info(`Invoice Status: SETTLED`)
      await Swapinvoice.query().where({'invoice': result['payment_request'], 'addIndex': result['add_index']}).update({
        paid: true
      })
      var swapRecord = await Swapinvoice.query().where({'invoice': result['payment_request'], 'addIndex': result['add_index']}).first()
      //Logger.debug(`Found swap record: ${swapRecord.id}`)
      console.log(swapRecord)
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

    var maxMinerFee = Env.get('SWAP_MAX_MINER_FEE')
    var maxPrepaymentAmt = Env.get('SWAP_MAX_PREPAY_AMT')
    var maxSwapFee = Env.get('SWAP_MAX_SWAP_FEE')
    var maxPrepayRoutingFee = maxPrepaymentAmt * Number(Env.get('SWAP_ROUTING_FEE_RATIO'))
    var maxSwapRoutingFee = Number(swapRecord.satoshis) * Number(Env.get('SWAP_ROUTING_FEE_RATIO'))

    var request = { 
      amt: swapRecord.satoshis, 
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

    this.swapClient.loopOut(request, function(err, response, swapRecord = swapRecord) {
      if(err){
        Logger.debug("swapserver response: ")
        Logger.crit(response)
        swapRecord.failed = true
        swapRecord.save()
      } else {
        Logger.debug("swapserver response: ")
        Logger.debug(response)
        swapRecord.swapid = response['id']
        swapRecord.htlc_address = response['htlc_address']
        swapRecord.save()
      }
    })
  }

  async swapStatus({view, request, response}){
    const swapId = request.url().split("/")[2]
    const swap = await Swapinvoice.find(swapId)
    if(!swap){
      Logger.error(`Couldn't find swap ${swapId}`)
      return view.render(`swap.invoice`, {swap: null, quote: null})
    }

    if(swap.paid){
      return view.render(`swap.invoice`, {swap: swap}) 
    }

    const total =  await this.calculateTotalFees(swap.satoshis)
    return view.render(`swap.invoice`, {swap: swap, quote: total })
  }

  addMinutes(date, minutes) {
    return new Date(date + minutes*60000);
  }

}

module.exports = SwapController
