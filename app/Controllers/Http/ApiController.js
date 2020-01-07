'use strict'
const Swapinvoice = use('App/Models/Swapinvoice')
const BtcWalletController = use('App/Services/BtcWalletController')
const Logger = use('Logger')

class ApiController {
  constructor(){
    this.wallet = new BtcWalletController()
    //this.swapClient = new looprpc.SwapClient('localhost:11010', grpc.credentials.createInsecure());
  }

  async swapStatus ({ view, request }) {
    const swapId = request.url().split("/")[3]
    const swap = await Swapinvoice.find(swapId)
    if(!swap){
      Logger.error(`Couldn't find swap ${swapId}`)
      return '{}'
    }

    if(!swap.paid && new Date(swap.created_at).getTime() + 60000 < Date.now() && !(Date.now()%10)){
      Logger.info("sweet spot")
      await this.wallet.connectToLnd()
      await this.wallet.unlockLndWallet()
      var invoice = await this.wallet.lookupInvoice(swap.r_hash)
      if(invoice.state === 'SETTLED'){
        await Swapinvoice.query().where({'invoice': invoice.payment_request, 'addIndex': invoice.add_index }).update({
          paid: true
        })
      }
    } 
    const response=JSON.stringify(swap);
    return response
  }
}

module.exports = ApiController
