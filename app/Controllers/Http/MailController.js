'use strict'

const Message = use('App/Models/Message')
const Elites = use('App/Models/User')
const Listing = use('App/Models/Listing')
const { validate } = use('Validator')

const MSG_REGULAR = 0
const MSG_BUY_REQUEST = 1
const MSG_BUY_ACCEPT = 2

class MailController {
  async index ({ view, auth, response, session }) {
    const queryMsg = await Message.query().where('receiverUsername', auth.user.username).fetch()
    //console.log(othermsgs['rows'][0]['$attributes'])
    var messages = []
    queryMsg['rows'].forEach((message)=>messages.push(message))
    var elite = null
    try {
      elite = await auth.getUser()
      console.log("displaying messages to "+ elite)
    } catch (error) {
      console.log(error)
      session
      .withErrors([{ field: 'notification', message: 'Not Logged in' }])
      .flashAll()
      return response.redirect('back')
    }
    elite.hasMail = false
    elite.save()
    return view.render('mail.index', { messages: messages })
  }

  async destroy ({ params, session, response, auth }) {
    const message = await Message.find(params.id)
    console.log('message deleted: ' + message)
    if(message.receiverAddress == auth.user.address){
      await message.delete()
      // Fash success message to session
      session.flash({ notification: 'Message deleted!' })
    }
    return response.redirect('back')
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

    try {
      await auth.check()
    } catch (error) {
      session
      .withErrors([{ field: 'notification', message: 'Not Logged in' }])
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
    await Elites.query().where('username', request.input('toElite').toString()).update({
      hasMail: true
    })

    var msgType = MSG_REGULAR
    const failed = await Listing.query().where('id', 244).first()
    //console.log(failed)
    if(params.id){
      const referenceListing = await Listing.query().where('id', params.id).first()
      //console.log(referenceListing)
      if(referenceListing.pendingAccept == false && referenceListing.accepted == false){
        // buyer wants to buy ln liquidity. Check they've funded the p2wsh and mark pending.
        msgType = MSG_BUY_REQUEST
        referenceListing.pendingAccept = true
        try{
          console.log('saving reference listing')
          referenceListing.save()
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
        console.log("ended in else :(")
        msgType = MSG_BUY_REQUEST
      }
    }
    const msg = new Message()
    msg.senderAddress = elite.address
    msg.senderUsername = elite.username
    msg.senderPicture = elite.picture
    msg.receiverUsername = toElite.username
    msg.receiverAddress = toElite.address
    msg.receiverPicture = toElite.picture
    msg.msgType = msgType
    msg.message = request.input('message')

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
      session.flash({ notification: 'Offer sent! ' + toElite.username + ' has 3 days to respond.' })
    } else {
      session.flash({ notification: 'Message sent!' })
    }
    
  
    return response.redirect('back')
  }
}

module.exports = MailController
