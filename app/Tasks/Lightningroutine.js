'use strict'

const Task = use('Task')
const Listing = use('App/Models/Listing')
const Message = use('App/Models/Message')
const BtcWalletController = use('App/Services/BtcWalletController')
const Logger = use('Logger')

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
  
  async markSellerRedeemable(listingId){
    var listing = await Listing.find(listingId)
    await Message.query().where({'aboutListing': listing.id, 'archived': false}).update({
      message: "sellerRedeemable"
    })
    listing.sellerRedeemable = true
    listing.buyerRedeemable = false
    listing.consecutiveFailedCheckups = 99
    listing.save()
    Logger.info(`Listing ${listingId} marked complete.`)
  }

  async markBuyerRedeemable(listingId, reason="N/A"){
    var listing = await Listing.find(listingId)
    await Message.query().where({'aboutListing': listing.id, 'archived': false}).update({
      message: "buyerRedeemable"
    })
    listing.sellerRedeemable = false
    listing.buyerRedeemable = true
    listing.consecutiveFailedCheckups = 99
    listing.save()
    Logger.info(`Refunded listing: ${listingId}, Reason: ${reason}`)
  }

  async handle () {
    console.log("Handle!")
    this.initWallet()
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
      if(!listing.accepted && listing.lastChanceToAccept < (new Date().getTime() / 1000).toFixed(0)){
        await this.markBuyerRedeemable(listing.id, "Seller didn't accept in time.")
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
        console.log("comparing " + Math.round(channel['capacity']) + " and " + new Number(listing['hasLSAT'] * Math.pow(10, 8)))
        if(channel['capacity'] == Math.round(new Number(listing['hasLSAT'] * Math.pow(10, 8)))){
          // We've established hat the channel is related to one of our listings
          console.log("Found new channel: " + channel['channel_id'] + ':' + channel['chan_point'] + " for " + channel['capacity'])
          foundChannel = true
          if(listing.channelOpen == false){
            await Message.query().where({'aboutListing': listing.id, 'archived': false}).update({
              message: "channelOpen"
            })
            var lsting = await Listing.find(listing.id)
            lsting.consecutiveFailedCheckups = 0
            lsting.channelOpen = true
            lsting.channelMustBeOpenUntil = ((new Date().getTime() + (listing.sellerPeriod*60*1000)) / 1000).toFixed(0) //(listing.sellerPeriod*24*60*60*1000)) / 1000).toFixed(0)
            lsting.accepted = true
            await lsting.save()
          } else {
            var lsting = await Listing.find(listing.id)
            lsting.consecutiveFailedCheckups = 0
          }

          if( listing.channelMustBeOpenUntil && listing.channelMustBeOpenUntil < (new Date().getTime() / 1000).toFixed(0) ){
            await this.markSellerRedeemable(listing.id)
          }


        } else {
          continue
        }
      }
      if(foundChannel)
        continue
      
      if( listing.channelMustBeOpenUntil && listing.channelMustBeOpenUntil < Math.floor(new Date().getTime() / 1000) ){
        continue // should be finished?
      }

      var lsting = await Listing.find(listing.id)
      
      
      lsting.consecutiveFailedCheckups = lsting.consecutiveFailedCheckups + 1
      if(lsting.channelOpen){
        await Message.query().where({'aboutListing': listing.id, 'archived': false}).update({
          message: "channelClosed"
        })
      }
      lsting.channelOpen = false

      if(lsting.lastChanceToOpenChannel && lsting.lastChanceToOpenChannel < ((new Date().getTime() / 1000).toFixed(0))){
        lsting.consecutiveFailedCheckups = 99
      } else {
        lsting.consecutiveFailedCheckups = 0 // Not expired, so just reset counter.
      }
      await lsting.save()

      //console.table(listing)
      if(lsting.consecutiveFailedCheckups > 2){
        await this.markBuyerRedeemable(lsting.id, "Seller closed channel early")
      }
      
    }
    await this.findExpiredMessages()
  }

  async asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

  async findExpiredMessages() {
    var now = (new Date().getTime() / 1000).toFixed(0)
    var listings = await Listing.query().whereNot({'lastChanceToFund': false, 'archived': true}).where('lastChanceToFund', '<', now).fetch()
    await this.asyncForEach(listings.toJSON(), async (listing) => {
      try{
        //var messagesthat = await Message.query().where({'aboutListing': listing.id, 'archived': false }).fetch()
        await Message.query().where({'aboutListing': listing.id, 'archived': false }).update({
          archived: true
        })
        //var lsting = await Listing.find(listing.id)
        //lsting.lastChanceToFund = false
        //lsting.pendingAccept = false
        this.wallet.resetListing(listing.id)
        lsting.save()
      } catch (e) {
        Logger.debug(e)
      }
    })
  }
}

module.exports = Lightningroutine
