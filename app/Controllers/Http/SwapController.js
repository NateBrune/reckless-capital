'use strict'

const { validate } = use('Validator')
const BtcWalletController = use('App/Services/BtcWalletController')
const Logger = use('Logger')
const Swapinvoice = use('App/Models/Swapinvoice')

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
  }

  async index ({ view, request }) {
    return view.render(`swap.index`)
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

    const requestedSats = request.input('liquidity')

    var invoiceId = await this.wallet.addInvoice(requestedSats)
    const swapId = await this.createSwapRecord(invoiceId, returnAddress, requestedSats)
    var result = this.wallet.resolveOnInvoice()
    result.then(this.handleInvoiceStatus(result))
    return response.redirect('/swapstatus/' + swapId)
  }

  async createSwapRecord(invoice, address, amt){
    const swap = new Swapinvoice()
    //Logger.info(invoice['payment_request'])
    swap.invoice = invoice['payment_request']
    swap.returnAddress = address
    swap.addIndex = invoice['add_index']
    swap.satoshis = Math.round(amt*100000000)
    swap.paid = false
    await swap.save()
    return swap.id
  }

  async handleInvoiceStatus(status){
    var result = await status
    Logger.debug(result)

    if(!result){
      Logger.debug("Invoice status is null.")
      return
    }

    if(result["state"] === "SETTLED"){
      Logger.info(`Invoice Status: SETTLED`)
      await Swapinvoice.query().where({'invoice': result['payment_request'], 'addIndex': result['add_index']}).update({
        paid: true
      })

      var request = { 
        amt: <int64>, 
        dest: <string>, 
        max_swap_routing_fee: <int64>, 
        max_prepay_routing_fee: <int64>, 
        max_swap_fee: <int64>, 
        max_prepay_amt: <int64>, 
        max_miner_fee: <int64>, 
        loop_out_channel: <uint64>, 
        sweep_conf_target: <int32>, 
        swap_publication_deadline: <uint64>
      }
      
    } else {
      await Swapinvoice.query().where({'invoice': result['payment_request'], 'addIndex': result['add_index']}).delete() // This could very well be a bug! TODO
    }
    return
  }

  async swapStatus({view, request, response}){
    const swapId = request.url().split("/")[2]
    const swap = await Swapinvoice.find(swapId)
    if(!swap){
      return view.render(`swap.invoice`, {swap: null, quote: null})
    }

    if(swap.paid){
      return view.render(`swap.invoice`, {swap: swap})
    }

    var request = { 
      amt: swap.satoshis, 
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
    Logger.info(result)
    //console.log(swap)
    const total = Number(result["swap_fee"]) + Number(result["prepay_amt"]) + Number(result["miner_fee"])
    return view.render(`swap.invoice`, {swap: swap, quote: total})
  }
}

module.exports = SwapController
