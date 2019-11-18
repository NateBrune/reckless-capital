'use strict'

const Listing = use('App/Models/Listing')
const Message = use('App/Models/Message')
const { validate } = use('Validator')
const Logger = use('Logger')

const BtcWalletController = use('App/Services/BtcWalletController')
var Env = use('Env')

const SERVICE_FEE = Env.get('SERVICE_FEE')

class ListingController {
  constructor (){
    this.wallet = new BtcWalletController()
  } 

  sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
  }

  async index ({ request, view, session, response }) {
    //const listings = await Listing.all()
    var all = request.all()
    //console.log(all)
    var sortBy = all['sortBy']
    var page = all['page']
    //var min = all['min']
    //var max = all['max']
    if(sortBy === undefined){ //|| min === undefined || max === undefined){
      sortBy = "newest"
    }
    if(page === undefined){
      page = 1
    }
    /*if(min > max){
      session
      .withErrors([{ field: 'notification', message: 'Minimum term cannot be greater than maximum term.' }])
      .flashAll()
      return response.redirect('back')
    }*/
    var queryListing = null
    switch(sortBy) {
      case "lowest_fee":
        queryListing = await Listing.query().where({'accepted': 0, 'archived': 0}).orderBy('stipend', 'asc').paginate(page, 10)
        break
      case "shortest_term":
        queryListing = await Listing.query().where({'accepted': 0, 'archived': 0}).orderBy('sellerPeriod', 'acs').paginate(page, 10)
        break
      case "longest_term":
        queryListing = await Listing.query().where({'accepted': 0, 'archived': 0}).orderBy('sellerPeriod', 'desc').paginate(page, 10)
        break
      case "newest":
        queryListing = await Listing.query().where({'accepted': 0, 'archived': 0}).paginate(page, 10)
        break
      default:
        return
    }
    //var listings = []
    //queryListing['rows'].forEach((listing)=>listings.push(listing))
    //console.log(queryListing.toJSON()['data'])
    return view.render('listings.index', {listings: queryListing.toJSON()})
    /*
    } else {
      //var queryListing = await Listing.query().where('accepted', 0).fetch()
      //var listings = []
      //queryListing['rows'].forEach((listing)=>listings.push(listing))
      //sort by cheapest to most expensive offers
      //const sortedListings = listings.sort((a, b) => (a.hasLSAT/a.stipend > b.hasLSAT/b.stipend) ? -1 : 1)
      var queryListing = await Listing.query().where('accepted', 0).fetch()
      var queryPageListing = await Listing.query().where('accepted', 0).paginate(1, 2)
      console.log(queryPageListing.toJSON())
      //var listings = []
      //queryListing['rows'].forEach((listing)=>listings.push(listing))
      return view.render('listings.index', {listings: queryPageListing.toJSON() })
      //return view.render('listings.index', {listings: queryListing['rows'] })
    }
    */
  }

  async new ({ view }) {
    return view.render('listings.new')
  }

  async store ({ auth, request, response, session }) {
    // validate form input
    const validation = await validate(request.all(), {
      owner: 'required',
      hasLSAT: 'required|range:0.000001,0.16777216',
      stipend: 'required|range:0.00000001,10.0',
      period: 'required|range:0,91',
    })
  
    // show error messages upon validation fail
    if (validation.fails()) {
      session.withErrors(validation.messages())
              .flashAll()
      return response.redirect('back')
    }

    /*try{
      await this.wallet.unlockLndWallet()
    } catch (e){
      console.log('error in store: ')
      console.log(e)
    }*/

    // persist to database
    const elite = await auth.getUser()
    const listing = new Listing()
    await this.wallet.connectToLnd()
    await this.wallet.unlockLndWallet()
    var connected = await this.wallet.connectPeerLND(request.input('owner'))
    if(!connected){
      session
      .withErrors([{ field: 'notification', message: 'Could not connect to peer. Check lightning address and verify your node is reachable by visiting https://1ml.com.' }])
      .flashAll()
      return response.redirect('back')
    }

    listing.sellerNodePublicKey = request.input('owner')
    listing.stipend = new Number(request.input('stipend')).toFixed(8)
    // Official Documentation: Floating point numbers cannot represent all decimals precisely in binary which can lead to unexpected results such as 0.1 + 0.2 === 0.3 returning false.
    // This is imprecise and may be abused by the users but i've decided to live with it.
    function roundUp(num, precision) {
      precision = Math.pow(10, precision)
      return Math.ceil(num * precision) / precision
    }
    var servicefee = roundUp(new Number(request.input('stipend')* 100000000 * SERVICE_FEE / 100000000), 8).toFixed(8)
    listing.servicefee = servicefee
    listing.hasLSAT = new Number(request.input('hasLSAT')).toFixed(8)
    listing.sellerPeriod = new Number(request.input('period')).toFixed(0)
    listing.wantsLSAT = null
    listing.sellerAddress = elite.refundAddress
    listing.sellerPublicKey = elite.publicKey
    listing.username = elite.username
    listing.picture = elite.picture
    listing.pendingAccept = false
    listing.inMempool = false
    listing.funded = false
    listing.accepted = false
    listing.channelOpen = false
    listing.sellerRedeemable = false
    listing.buyerRedeemable = false
    listing.redeemed = false
    listing.consecutiveFailedCheckups = 0
    listing.archived = false
    listing.lastChanceToFund = false
    await listing.save()
    // Fash success message to session
    session.flash({ notification: 'Listing added!' })
  
    return response.redirect('back')
  }

  async destroy ({ params, session, response, auth }) {
    const listing = await Listing.find(params.id)
    
    if(listing.sellerPublicKey == auth.user.publicKey){
      await listing.delete()
      await Message.query().where({'aboutListing': params.id, 'archived': false}).update({
        'archived': true
      })
      // Fash success message to session
      session.flash({ notification: 'Offer deleted!' })
    }
    return response.redirect('back')
  }

  async acceptListing({response, request, session, params, auth}) {
    //const url = request.url()
    //const id = url.split("/")[2]
    const listing = await Listing.find(params.id)
    if(listing == null){
      session
      .withErrors([{ field: 'notification', message: 'Invalid offer id.' }])
      .flashAll()
      return response.redirect('back')
    }
    console.log("accepting listing but the last chance is: " + listing.lastChanceToAccept)
    if(auth.user.publicKey === listing.sellerPublicKey && listing.lastChanceToAccept > (new Date().getTime() / 1000).toFixed(0)){
      await Message.query().where({'aboutListing': params.id, 'archived': false}).update({
        message: "accepted"
      })
      listing.accepted = true
      listing.lastChanceToOpenChannel = ((new Date().getTime() + (24*60*60*1000)) / 1000).toFixed(0)
      await listing.save()
      console.log("saved listing with last change = " + ((new Date().getTime() + (24*60*60*1000)) / 1000).toFixed(0))
      session.flash({ notification: 'Accepted!' })
      return response.redirect('back')
    } else {
        if(listing.lastChanceToAccept > (new Date().getTime() / 1000).toFixed(0)){
          session
          .withErrors([{ field: 'notification', message: "Too late to accept listing!" }])
          .flashAll()
          return response.redirect('back')
        }
      session
      .withErrors([{ field: 'notification', message: "Invalid user for this listing." }])
      .flashAll()
      return response.redirect('back')
    }
  }

  async declineListing({response, request, session, params, auth}) {
    //const url = request.url()
    //const id = url.split("/")[2]
    const listing = await Listing.find(params.id)
    if(listing == null){
      session
      .withErrors([{ field: 'notification', message: 'Invalid offer id.' }])
      .flashAll()
      return response.redirect('back')
    }
    if(auth.user.publicKey === listing.sellerPublicKey){
      var txData = await this.wallet.refundListing(id, listing.buyerAddress, true)
      return response.redirect('/plsSignTx/'+txData)
    } else {
      session
      .withErrors([{ field: 'notification', message: "Invalid user for this listing." }])
      .flashAll()
      return response.redirect('back')
    }
  }

  async withdrawFrom({response, session, params, auth}){
    const listing = await Listing.find(params.id)
    if(listing == null){
      Logger.debug(`tried to withdraw invalid listing ${params.id}`)
      session
      .withErrors([{ field: 'notification', message: 'Invalid offer id.' }])
      .flashAll()
      return response.redirect('/offers')
    }
    Logger.debug("attempting to withdrawl: " + auth.user.publicKey)
    if(listing.sellerRedeemable && auth.user.publicKey == listing.sellerPublicKey){
      var txData = await this.wallet.refundListing(params.id, listing.sellerAddress, false, 1)
      Logger.debug("reward sent to: " + listing.sellerAddress)
      session.flash({ notification: 'Reward sent to your address!' })
      return response.redirect('/plsSignTx/'+txData)
    } else if(listing.buyerRedeemable && auth.user.publicKey == listing.buyerPublicKey){
      try{
        var txData = await this.wallet.refundListing(params.id, listing.buyerAddress, false, -1)
        session.flash({ notification: 'Refund sent to your address!' })
        Logger.debug("refund sent to: " + listing.buyerAddress)
        return response.redirect('/plsSignTx/'+txData)
      } catch(e){
        Logger.debug(`withdrawing encountered error on listing: ${params.id}`)
        Logger.debug(e)
        session.flash({ notification: 'A server error occured while attempted to withdraw. Please get in contact.' }) //TODO: get contact email setup
        return response.redirect('/offers')
      }

    } else {
      session
      .withErrors([{ field: 'notification', message: "Invalid user for this listing." }])
      .flashAll()
      return response.redirect('back')
    }
  }

  async walletnotify ({ params, request }) {
    console.log("walletnotify: " + request.input('txid'))
    await this.wallet.walletNotify(request.input('txid'))
  }
}

module.exports = ListingController
