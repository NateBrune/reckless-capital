'use strict'

const Message = use('App/Models/Message')
const Elites = use('App/Models/User')
const Listing = use('App/Models/Listing')
const User = use('App/Models/User')

const BtcWalletController = use('App/Services/BtcWalletController')

const { validate } = use('Validator')

const MSG_REGULAR = 0
const MSG_BUY_REQUEST = 1
const MSG_BUY_ACCEPT = 2

class MailController {

  constructor(){
    this.wallet = new BtcWalletController()
  }

  async index ({ view, auth, response, session }) {
    const messages = await Message.query().where('receiverUsername', auth.user.username).fetch()
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
    const listings = await Listing.all()
    return view.render('mail.index', { messages: messages.toJSON(), listings: listings.toJSON() })
  }

  async asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

  async offers ({ view, auth, response, session }) {
    await User.query().where('publicKey', auth.user.publicKey).update({
      hasOffer: false
    })

    
    var queryMsg = await Message.query().where('receiverUsername', auth.user.username).where('archived', false).fetch()
    var messages = []
    queryMsg.toJSON().forEach((message)=>messages.push(message))
    queryMsg = await Message.query().where('senderUsername', auth.user.username).where('archived', false).fetch()
    //console.log(queryMsg.toJSON())
    queryMsg.toJSON().forEach((message)=>messages.push(message))
    //var elite = await auth.getUser()
    //elite.hasOffer = false
    //elite.save()
    console.log(`setting ${auth.user.publicKey} to false`)

    var redeemScripts = {}
    var listingAddress = {}
    var listingStatus = {}
    var listingLiquidity = {}
    var listingStipend = {}
    var listingServiceFee = {}
    var listingOpenUntil = {}
    var lnAddress = {}
    var listingBuyerRefundAddress = {}
    var listingSellerRefundAddress = {}
    var listingOpenBy = {}
    var calculatedTotalSats = {}
    await this.asyncForEach (messages, async (message) => {
      if(message.msgType == MSG_BUY_REQUEST){
        // TODO: clean this up await Listing.query().where('id', message.aboutListing).fetch().then((result)=>result.toJSON()) 
        const listing = await Listing.find(message.aboutListing)
        if(listing !== null){
          redeemScripts[message.aboutListing] = listing.redeemScript
          listingAddress[message.aboutListing] = listing.fundingAddress
          listingStatus[message.aboutListing] = message.message.split(":")[0].toLowerCase() // this should be fixed?
          listingLiquidity[message.aboutListing] = listing.hasLSAT
          listingStipend[message.aboutListing] = listing.stipend
          listingServiceFee[message.aboutListing] = listing.servicefee
          lnAddress[message.aboutListing] = listing.buyerNodePublicKey
          listingOpenUntil[message.aboutListing] = listing.channelMustBeOpenUntil
          listingBuyerRefundAddress[message.aboutListing] = listing.buyerAddress
          listingSellerRefundAddress[message.aboutListing] = listing.sellerAddress
          listingOpenBy[message.aboutListing] = listing.lastChanceToOpenChannel
          calculatedTotalSats[message.aboutListing] = new Number((Math.round(listing.stipend*100000000)+Math.round(listing.servicefee*100000000)) / 100000000).toFixed(8)
        } else {
          console.log("message " + message.id + " found to have unknown aboutListing: " + message.aboutListing)
          //await Message.query().where('aboutListing', message.aboutListing).delete()
          await Message.query().where('aboutListing', message.aboutListing).update({
            archived: true
          })
        }
      }
      console.log(listingStipend)
      console.log(listingServiceFee)
      console.log(calculatedTotalSats)
    })
    console.log(listingStatus)
    return view.render('mail.offers', { messages: messages, redeemScripts: redeemScripts, listingAddress: listingAddress, listingStatus: listingStatus, listingLiquidity: listingLiquidity, listingStipend: listingStipend, listingServiceFee: listingServiceFee, listingOpenUntil: listingOpenUntil, lnAddress: lnAddress, listingBuyerRefundAddress: listingBuyerRefundAddress, listingOpenBy: listingOpenBy, listingSellerRefundAddress: listingSellerRefundAddress, calculatedTotalSats: calculatedTotalSats })
  }

  async destroy ({ params, session, response, auth }) {
    const message = await Message.find(params.id)
    if(message === null){
      session.flash({ notification: 'Message deleted!' })
      return response.redirect('back')
    }
    if((message.receiverAddress == auth.user.address)||(message.senderAddress == auth.user.address)){
      const listing = await Listing.find(message.aboutListing)
      await message.delete()
      // Put listing back on the map
      if(listing != null){
        if(listing.consecutiveFailedCheckups == 99){
          var txData = await this.wallet.refundListing(message.aboutListing, listing.buyerAddress, false)
        } else if(listing.redeemed){
          session.flash({ notification: 'Message deleted!' })
          return response.redirect('back')
        } else {
          var txData = await this.wallet.refundListing(message.aboutListing, listing.buyerAddress, true)
        }
        
        session.flash({ notification: 'Message deleted!' })
        return response.redirect('/plsSignTx/'+txData)
        /*
        listing.pendingAccept = false
        listing.inMempool = false
        listing.funded = false
        await listing.save()
        */
      }
      session.flash({ notification: 'Message deleted!' })
    }
    return response.redirect('back')
  }

  async setMessage (message, msgType, tx) {
    if(msgType == MSG_REGULAR){
      return message
    } else {

      return "Pending:"+tx.address+":"+tx.redeem.output.toString('hex')
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
        

        /* unused */ 
        
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

        try{
          await referenceListing.save()
          msg.aboutListing = referenceListing.id
        } catch {
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
    console.log("Sent message type: "+msgType)
    msg.msgType = msgType
    msg.message = _Message
    msg.archived = false

    try {
    await msg.save()
    } catch {
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
