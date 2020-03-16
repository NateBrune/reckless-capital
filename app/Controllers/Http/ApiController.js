'use strict'
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
