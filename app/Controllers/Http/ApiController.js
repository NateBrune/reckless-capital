'use strict'
const Swapinvoice = use('App/Models/Swapinvoice')
const BtcWalletController = use('App/Services/BtcWalletController')
const Logger = use('Logger')

class ApiController {
  constructor(){
    this.wallet = new BtcWalletController()
    this.nodeinfo = null
    this.aboutMe = null
    this.lastCheckForInfo = null
    this.lastCheckForMe = null
    //this.swapClient = new looprpc.SwapClient('localhost:11010', grpc.credentials.createInsecure());
  }

  async swapStatus ({ request }) {
    const swapId = request.url().split("/")[3]
    const swap = await Swapinvoice.find(swapId)
    if(!swap){
      Logger.error(`Couldn't find swap ${swapId}`)
      return '{}'
    }
    // One in 10 chance when the user asks we actually lookup if the invoice is complete. This mitigates?
    if(!swap.paid && new Date(swap.created_at).getTime() + 60000 < Date.now() && !(Date.now()%10)){
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
  
  async nodeInfo({ request }) {
    const nodeId = request.url().split("/")[3]
    if(nodeId){
      return await this.wallet.getNodeInfo(nodeId)
    } else {
      var endTime = new Date();
      // If we have elapsed 10 minutes since we last checked get latest info on our node.
      if(this.lastCheckForMe == null || endTime - this.lastCheck > 600000){
        var info = await this.wallet.getInfo()
        this.aboutMe = await this.wallet.getNodeInfo(info['identity_pubkey'])
      }
      this.lastCheckForMe= endTime
      return this.aboutMe
    }
  }

  async getInfo() {
    var endTime = new Date();
    // If we have elapsed 10 minutes since we last checked get latest info on our node.
    if(this.lastCheckForInfo == null || endTime - this.lastCheck > 600000){
      this.nodeinfo = await this.wallet.getInfo()
    }
    this.lastCheckForInfo = endTime
    return this.nodeinfo
  }
}

module.exports = ApiController
