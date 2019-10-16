'use strict'

const Task = use('Task')
const Listing = use('App/Models/Listing')
const Message = use('App/Models/Message')
const BtcWalletController = use('App/Services/BtcWalletController')


class Lightningroutine extends Task {

  static get schedule () {
    return '*/1 * * * *'
  }

  sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
  }

  initWallet(){
    if(this.wallet === undefined)
      this.wallet = new BtcWalletController()
  }

  async handle () {
    console.log("Handle!")
    this.initWallet()
    await this.wallet.connectToLnd()
    //await this.sleep(200)
    await this.wallet.unlockLndWallet()
    console.log("unlocked")
    //await this.sleep(200)
    var queryListing = await Listing.query().where('funded', 1).fetch()
    //console.log(queryListing)
    var listings = []
    queryListing.toJSON().forEach((listing)=>listings.push(listing))

    for ( const listing of listings ){
      var foundChannel = false
      if(listing.consecutiveFailedCheckups>2){
        console.log("skipping: " + listing.id)
        //console.table(listing)
        continue
      }
      
      var sellerNodePublicKey = listing['sellerNodePublicKey'].split("@")[0]
      var buyerNodePublicKey = listing['buyerNodePublicKey'].split("@")[0]
      //console.log(`get node ${sellerNodePublicKey}`)
      var info = null
      try{
        var info = await this.wallet.getNodeInfo(sellerNodePublicKey)
      } catch (e){
        //TODO: delete listing?
        console.log(`skipping bad public key: ${sellerNodePublicKey}`)
        continue
      }
      
      console.log("searching channels for " + sellerNodePublicKey+":"+buyerNodePublicKey+"@"+listing['hasLSAT'])
      for (var channel of info['channels']){
        //console.log("inspecting channel")
        //console.log(channel)
        if(channel['node1_pub'] === buyerNodePublicKey){
          if(channel['node2_pub'] !== sellerNodePublicKey){
            //console.log("node2 isn't seller: "+sellerNodePublicKey+" "+channel['node2_pub'])
            continue
          }
        } else if(channel['node1_pub'] === sellerNodePublicKey){
            if(channel['node2_pub'] !== buyerNodePublicKey){
              //console.log("node2 isnt buyer: "+buyerNodePublicKey+" "+channel['node2_pub'])
              continue
            }
        } else {
          //console.log("Nobody we're interested in?")
          //console.log(channel)
          continue
        }
        console.log("comparing " + channel['capacity'] + " and " + new Number(listing['hasLSAT'] * Math.pow(10, 8)))
        if(channel['capacity'] == new Number(listing['hasLSAT'] * Math.pow(10, 8))){
          // We've established hat the channel is related to one of our listings
          console.log("Found Channel: " + channel['channel_id'] + ':' + channel['chan_point'] + " for " + channel['capacity'])
          foundChannel = true
          if(listing.channelOpen == false){
            await Message.query().where('aboutListing', listing.id).update({
              message: "channelOpen:"+listing.fundingAddress+":"+listing.redeemScript
            })
            var lsting = await Listing.find(listing.id)
            lsting.consecutiveFailedCheckups = 0
            lsting.channelOpen = true
            lsting.channelMustBeOpenUntil = ((new Date().getTime() + (listing.sellerPeriod*60*1000)) / 1000).toFixed(0) //(listing.sellerPeriod*24*60*60*1000)) / 1000).toFixed(0)
            await lsting.save()
            console.log("First Seen, updated listing and message.")
          }

          if( listing.channelMustBeOpenUntil && listing.channelMustBeOpenUntil < (new Date().getTime() / 1000).toFixed(8) ){
            await Message.query().where('aboutListing', lsting.id).update({
              message: "sellerRedeemable:"+lsting.fundingAddress+":"+lsting.redeemScript
            })
            lsting.sellerRedeemable = true
            lsting.buyerRedeemable = false
            console.log("marking " + lsting.id +" complete :)")
          }


        } else {
          console.log("skiping " + channel['capacity'] + " channel")
          continue
        }
      }
      
      console.log("foundChannel: "+ foundChannel)

      if(foundChannel)
        continue
      
      if( listing.channelMustBeOpenUntil && listing.channelMustBeOpenUntil < Math.floor(new Date().getTime() / 1000) ){
        console.log("expired? " + listing.channelMustBeOpenUntil + " " + Math.floor(new Date().getTime() / 1000))
        continue // should be finished?
      }

      var lsting = await Listing.find(listing.id)
      
      
      lsting.consecutiveFailedCheckups = lsting.consecutiveFailedCheckups + 1
      if(lsting.channelOpen){
        await Message.query().where('aboutListing', listing.id).update({
          message: "channelClosed:"+listing.fundingAddress+":"+listing.redeemScript
        })
      }
      lsting.channelOpen = false

      if(lsting.lastChanceToOpenChannel && lsting.lastChanceToOpenChannel < ((new Date().getTime() / 1000).toFixed(0))){
        console.log("marking " + lsting.id  + " expired " + lsting.lastChanceToOpenChannel + " < " + ((new Date().getTime() / 1000).toFixed(0)))
        lsting.consecutiveFailedCheckups = 99
      } else {
        lsting.consecutiveFailedCheckups = 0 // Not expired, so just reset counter.
      }

      console.log("Failing "+ listing.id +" current consecutive failed checkups: " + lsting.consecutiveFailedCheckups)
      //console.table(listing)
      if(lsting.consecutiveFailedCheckups > 2){
        await Message.query().where('aboutListing', lsting.id).update({
          message: "buyerRedeemable:"+lsting.fundingAddress+":"+lsting.redeemScript
        })
        lsting.sellerRedeemable = false
        lsting.buyerRedeemable = true
      }
      await lsting.save()
    }
  }
}

module.exports = Lightningroutine
