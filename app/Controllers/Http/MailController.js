'use strict'

const Message = use('App/Models/Message')
const Elites = use('App/Models/User')
const Listing = use('App/Models/Listing')
const User = use('App/Models/User')
const Logger = use('Logger')

const BtcWalletController = use('App/Services/BtcWalletController')

const { validate } = use('Validator')

const MSG_REGULAR = 0
const MSG_BUY_REQUEST = 1
const MSG_BUY_ACCEPT = 2

class MailController {

  constructor(){
    this.wallet = new BtcWalletController()
  }

  async index ({ view, auth, response, session, request }) {
    //var messages = []
    //queryMsg['rows'].forEach((message)=>messages.push(message))
    var elite = null
    try {
      elite = await auth.getUser()
    } catch (error) {
      console.log(error)
      session
      .withErrors([{ field: 'notification', message: 'Not Logged in' }])
      .flashAll()
      return response.redirect('back')
    }
    elite.hasMail = false
    elite.save()

    var all = request.all()
    //console.log(all)
    var sortBy = all['sortBy']
    var page = all['page']
    if(page === undefined){
      page = 1
    }
    //var min = all['min']
    //var max = all['max']
    if(sortBy === undefined){ //|| min === undefined || max === undefined){
      sortBy = "Received"
    }

    var messages = []

    if(sortBy === "Sent"){
      var query  = await Message.query().where({'senderUsername': auth.user.username, archived: false}).orderBy('created_at', 'desc').paginate(page, 10)
      messages = query.toJSON()
    }

    if( sortBy === "Received"){
      var query = await Message.query().where({'receiverUsername': auth.user.username, archived: false}).orderBy('created_at', 'desc').paginate(page, 10)
      messages = query.toJSON()
    }

    if(sortBy === "ArchivedSent"){
      var query  = await Message.query().where({'senderUsername': auth.user.username, archived: true}).orderBy('created_at', 'desc').paginate(page, 10)
      messages = query.toJSON()
    }

    if( sortBy === "ArchivedReceived"){
      var query = await Message.query().where({'receiverUsername': auth.user.username, archived: true}).orderBy('created_at', 'desc').paginate(page, 10)
      messages = query.toJSON()
    }

    return view.render('mail.index', { messages: messages })
  }

  async asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

  async offers ({ view, auth, response, request, session }) {

    var elite = await auth.getUser()
    elite.hasOffer = false
    await elite.save()

    var all = request.all()
    var page = all['page']
    var sortBy = all['sortBy']
    if(page === undefined){
      page = 1
    }
    if(sortBy === undefined){
      sortBy = "buyer"
    }
    var messages = undefined
    if(sortBy == "buyer"){
      messages = await Message.query().where({'senderUsername': auth.user.username, 'archived': false}).whereNot({'aboutListing': null}).orderBy('created_at', 'desc').paginate(page, 2)
    } else if(sortBy == "seller") {
      messages = await Message.query().where({'receiverUsername': auth.user.username, 'archived': false}).whereNot({'aboutListing': null}).orderBy('created_at', 'desc').paginate(page, 2)
    } else {
      
    }
    var listings = {}
      
    await this.asyncForEach (messages.rows, async (message) => {
      var result = await Listing.query().where('id', message.aboutListing).first()

      if(result === null){
        await Message.query().where({'aboutListing': message.aboutListing, 'archived': false}).update({
          archived: true
        })
      }

      listings[message.aboutListing] = result.toJSON()
    })
    return view.render('mail.offers', { messages: messages.toJSON(), listings: listings })
  }

  async destroy ({ params, session, response, auth }) {
    const message = await Message.find(params.id)
    if(message === null){
      session.flash({ notification: 'Message deleted!' })
      return response.redirect('back')
    }
    if((message.receiverAddress == auth.user.address)||(message.senderAddress == auth.user.address)){
      const listing = await Listing.find(message.aboutListing)
      // Put listing back on the map
      if(listing != null){
        if(listing.consecutiveFailedCheckups == 99 && !(listing.sellerRedeemable || listing.buyerRedeemable || listing.funded || listing.inMempool)){
          var txData = await this.wallet.refundListing(message.aboutListing, listing.buyerAddress, false, -1)
        } else if(listing.funded == false){
          await this.wallet.resetListing(message.aboutListing)
        } else {
          //var txData = await this.wallet.refundListing(message.aboutListing, listing.buyerAddress, true)
          session
          .withErrors([{ field: 'notification', message: 'Cannot cancel contract during liquidity lease.' }])
          .flashAll()
          return response.redirect('/offers')
        }
      }
    }
    session.flash({ notification: 'Message deleted!' })
    message.archived = true
    await message.save()
    return response.redirect('back')
  }

  async setMessage (message, msgType, tx) {
    if(msgType == MSG_REGULAR){
      return message
    } else {
      return "Pending"
    }
  }

  async sendMsg ({ auth, request, response, session, params }) {
    // validate form input
    const validation = await validate(request.all(), {
      toElite: 'required',
      message: 'required'
    })
    // show error messages upon validation fail
    if (validation.fails()) {
      console.log("validation failed @ MailController sendMsg")
      session.withErrors(validation.messages())
              .flashAll()
      return response.redirect('back')
    }

    // persist to database
    const elite = await auth.getUser()
    const toElite = await Elites.query().where('username', request.input('toElite')).first()
    if(toElite === null){
      session
      .withErrors([{ field: 'notification', message: 'The username ' + request.input('toElite').toString() + ' is not registered to any address!' }])
      .flashAll()
      return response.redirect('back')
    }

    var msgType = MSG_REGULAR
    var tx = null
    var _Message = request.input('message')
    const msg = new Message()
    if(params.id){
      const referenceListing = await Listing.query().where('id', params.id).first()
      if(!referenceListing){
        session
        .withErrors([{ field: 'notification', message: "Listing doesn't exist, invalid id."}])
        .flashAll()
        return response.redirect('back')
      }
      //console.log(referenceListing)
      if(referenceListing.pendingAccept == false && referenceListing.accepted == false){
        // buyer wants to buy ln liquidity. Check they've funded the p2wsh and mark pending.
        msgType = MSG_BUY_REQUEST
        const walletService = new BtcWalletController()    // validate form input
        const validation = await validate(request.all(), {
          toElite: 'required',
          message: 'required',
          buyerNodePublicKey: 'required'
        })
        // show error messages upon validation fail
        if (validation.fails()) {
          console.log("validation failed")
          session.withErrors(validation.messages())
                  .flashAll()
          return response.redirect('back')
        }
        tx = await walletService.appendP2WSHtoListing(referenceListing, elite.publicKey,toElite.publicKey)
        _Message = await this.setMessage(request.input('message'), msgType, tx)

        
        await Elites.query().where('username', request.input('toElite').toString()).update({
          hasOffer: true
        })

        if(!elite.refundAddress && !request.input('buyerRefundAddress')){
          session
          .withErrors([{ field: 'notification', message: 'Please set a payment address in transaction or on your profile.' }])
          .flashAll()
          return response.redirect('back')
        }

        await Elites.query().where('username', auth.user.username).update({
          hasOffer: true
        })

        if(request.input('buyerRefundAddress')){
          referenceListing.buyerAddress = request.input('buyerRefundAddress')
          console.log("reference listing address: " + request.input('buyerRefundAddress'))
          elite.refundAddress = request.input('buyerRefundAddress')
          await elite.save()
        } else if ( elite.refundAddress ) { /* should always be true if not request.input */
          referenceListing.buyerAddress = elite.refundAddress
          console.log("reference listing address: " + elite.refundAddress)
        } else {
          console.log("buyer refund address: ")
          console.log(request.input('buyerRefundAddress'))
          session
          .withErrors([{ field: 'notification', message: "NORNDADRS Refund Address wasn't specified in message request or on profile and a listing id is specified. Sever Error." }])
          .flashAll()
          return response.redirect('back')
        }
        
        await this.wallet.connectToLnd()
        await this.wallet.unlockLndWallet()
        var connected = await this.wallet.connectPeerLND(request.input('buyerNodePublicKey'))
        if(!connected){
          session
          .withErrors([{ field: 'notification', message: 'Could not connect to peer. Check lightning address and verify your node is reachable by visiting https://1ml.com.' }])
          .flashAll()
          return response.redirect('back')
        }

        referenceListing.buyerNodePublicKey = request.input('buyerNodePublicKey')
        referenceListing.buyerPublicKey = elite.publicKey
        referenceListing.sellerPublicKey = toElite.publicKey
        referenceListing.lastChanceToFund = new Number((new Date().getTime() + 3*60*1000) / 1000).toFixed(0)
        Logger.info(`last chance to fund ${referenceListing.lastChanceToFund}`)
        try{
          await referenceListing.save()
          msg.aboutListing = referenceListing.id
        } catch(e) {
          Logger.debug(e)
          session
          .withErrors([{ field: 'notification', message: 'Failed to mark listing as pending accept.' }])
          .flashAll()
          return response.redirect('back')
        }
      } else if(referenceListing.pendingAccept === true && referenceListing.accepted === false) {
        // dealer wants to accept buyer. Check if ln  channel is opened.
        msgType = MSG_BUY_ACCEPT
      } else {
        msgType = MSG_BUY_REQUEST
      }
    } else {
      await Elites.query().where('username', request.input('toElite').toString()).update({
        hasMail: true
      })
    }
    
    msg.senderAddress = elite.address
    msg.senderUsername = elite.username
    msg.senderPicture = elite.picture
    msg.receiverUsername = toElite.username
    msg.receiverAddress = toElite.address
    msg.receiverPicture = toElite.picture
    msg.msgType = msgType
    msg.message = _Message
    msg.archived = false

    try {
    await msg.save()
    } catch (e){
      Logger.debug(e)
      session
      .withErrors([{ field: 'notification', message: 'Message type-('+msgType+'): Failed to send message.' }])
      .flashAll()
      return response.redirect('back')
    }
    try {
      
    } catch {

    }

    // Fash success message to session
    if(params.id){
      session.flash({ notification: 'Offer sent! Please fund this order.' })
      return response.redirect('/offers')
    } else {
      session.flash({ notification: 'Message sent!' })
      return response.redirect('back')
    }
    
  
    
  }

}

module.exports = MailController
