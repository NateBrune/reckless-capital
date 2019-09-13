'use strict'

const Message = use('App/Models/Message')
const Elites = use('App/Models/User')
const Listing = use('App/Models/Listing')

const BtcWalletController = use('App/Services/BtcWalletController')

const { validate } = use('Validator')

const MSG_REGULAR = 0
const MSG_BUY_REQUEST = 1
const MSG_BUY_ACCEPT = 2

class MailController {
  async index ({ view, auth, response, session }) {
    const queryMsg = await Message.query().where('receiverUsername', auth.user.username).fetch()
    var messages = []
    queryMsg['rows'].forEach((message)=>messages.push(message))
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
    return view.render('mail.index', { messages: messages, listings: listings.toJSON() })
  }

  async asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

  async offers ({ view, auth, response, session }) {
    var queryMsg = await Message.query().where('receiverUsername', auth.user.username).fetch()
    var messages = []
    queryMsg['rows'].forEach((message)=>messages.push(message))
    queryMsg = await Message.query().where('senderUsername', auth.user.username).fetch()
    queryMsg['rows'].forEach((message)=>messages.push(message))
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
    elite.hasOffer = false
    elite.save()

    var redeemScripts = {}
    var listingAddress = {}
    var listingStatus = {}
    var listingLiquidity = {}
    var listingStipend= {}
    await this.asyncForEach (messages, async (message) => {
      if(message.msgType == MSG_BUY_REQUEST){
        const listing = await Listing.find(message.aboutListing)
        if(listing !== null){
          redeemScripts[message.aboutListing] = listing.redeemScript
          listingAddress[message.aboutListing] = listing.fundingAddress
          listingStatus[message.aboutListing] = message.message.split(":")[0].toLowerCase()
          listingLiquidity[message.aboutListing] = listing.hasLSAT
          listingStipend[message.aboutListing] = listing.stipend
          
        }
      }
      //console.log(listingStipend)
    })
    return view.render('mail.offers', { messages: messages, redeemScripts: redeemScripts, listingAddress: listingAddress, listingStatus: listingStatus, listingLiquidity: listingLiquidity, listingStipend: listingStipend })
  }

  async destroy ({ params, session, response, auth }) {
    const message = await Message.find(params.id)
    if((message.receiverAddress == auth.user.address)||(message.senderAddress == auth.user.address)){
      const listing = await Listing.find(message.aboutListing)
      await message.delete()
      // Put listing back on the map
      if(listing != null){
        listing.pendingAccept = false
        listing.inMempool = false
        listing.funded = false
        await listing.save()
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
      console.log("validation failed")
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
      //console.log(referenceListing)
      if(referenceListing.pendingAccept == false && referenceListing.accepted == false){
        // buyer wants to buy ln liquidity. Check they've funded the p2wsh and mark pending.
        msgType = MSG_BUY_REQUEST
        const walletService = new BtcWalletController()
        tx = await walletService.appendP2WSHtoListing(referenceListing, elite.publicKey,toElite.publicKey)
        _Message = await this.setMessage(request.input('message'), msgType, tx)

        
        await Elites.query().where('username', request.input('toElite').toString()).update({
          hasOffer: true
        })

        await Elites.query().where('username', auth.user.username).update({
          hasOffer: true
        })

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
