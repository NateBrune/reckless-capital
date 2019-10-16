'use strict'
const User = use('App/Models/User')
const Listing = use('App/Models/Listing')
const Message = use('App/Models/Message')
const Challenges = use('App/Models/Challenges')
const { validate } = use('Validator')
const BtcWalletController = use('App/Services/BtcWalletController')

//const bitcoin = require('bitcoinjs-lib')
var bitcoinMessage = require('bitcoinjs-message')

class LoginController {

  constructor(){
    this.wallet = new BtcWalletController()
  }

  async index ({ view }) {
    return view.render('login.index')
  }
  async signup ({ view }) {
    return view.render('login.signup')
  }

  async createAccout ({auth, session, request, response}) {
    
  }

  async settings ({ view }) {
    return view.render('login.settings')
  }

  async updateprofile ({ auth, session, request, response}) {
    if(request.input('username') != auth.user.username){
      try{
        const usernameCount = await User.query().where('username', request.input('username')).count()
        const total = usernameCount[0]['count(*)']
        if(total > 0){
          session.flash({ notification: 'Username taken'})
          return response.redirect('back')
        }
      } catch(error){
        console.log(error) 
      }
    }
    const elite = await auth.getUser()
    elite.username = request.input('username')
    elite.picture = request.input('picture')
    elite.refundAddress = request.input('refundAddress')
    elite.email = request.input('email')
    elite.save()
    console.log(request.input('picture'))
    session.flash({ notification: 'Profile settings saved.'})
    
    await Listing.query().where('sellerPublicKey', elite.publicKey).update({
      username: elite.username,
      picture: elite.picture
    })

    await Message.query().where('senderAddress', elite.address).update({
      senderUsername: elite.username,
      senderpicture: elite.picture
    })

    await Message.query().where('receiverAddress', elite.address).update({
      receiverUsername: elite.username,
      receiverpicture: elite.picture
    })

    console.log("updating " + elite.address + " to " + elite.username)
    return response.redirect('back')
  }

  /* TODO: await which result in an exception will return the error message to the user here */
  async challenge ({ request, session }) {
    const url = request.url()
    const elitePublicKey = url.split("/")[2]
    if(elitePublicKey.length !== 65){
      Logger.debug("bitch tried %s", elitePublicKey)
      throw Error("Incorrect public key length")
    }
    //console.log()
    Logger.debug("challenge for: "+ this.wallet.derriveAddressFromPublicKey(elitePublicKey))
    //const elite = await User.query().where('publicKey', elitePublicKey).first()
    const challenge = this.generate(128)
    const userId = await Challenges.table('challenges').insert({publicKey: elitePublicKey, challenge: challenge})
    /*
    if(elite === null){
      const eliteAddress = this.wallet.derriveAddressFromPublicKey(elitePublicKey)
      const user = new User()
      user.username = null
      user.publicKey = elitePublicKey
      user.address = eliteAddress
      user.picture = null
      user.challenge = challenge
      user.undisputedTxn = 0
      user.disputedTxn = 0
      await user.save()
      console.log("new user: " + elitePublicKey)
    } else {
      elite.challenge = challenge
      await elite.save()
    }
    */

    return challenge
  }

  async verify ({ auth, request, response, session }) {
    console.log("in verify")
    const url = request.url()
    // validate form input
    const validation = await validate(request.all(), {
      signature: 'required',
      publicKey: 'required',
      username: 'required'
    })

    // show error messages upon validation fail
    if (validation.fails()) {
      console.log("validation failed")
      session.withErrors(validation.messages())
              .flashAll()
      return response.redirect('back')
    }

        
    console.log("pubkey: " + request.input('publicKey'))
    console.log("signature: " + request.input('signature'))
    const elitePublicKey = request.input('publicKey')
    const eliteSignature = request.input('signature')
    console.log("verifying: "+elitePublicKey)
    console.log("username: "+ request.input('username'))
    console.log("mnemonic: "+ request.input('mnmonic'))

    const elite = await User.query().where('publicKey', elitePublicKey).first()
    if(elite === null){
      //return 'Attempted to verify with unknown address'
      console.log("Attempted to verify with unknown address")
      session
      .withErrors([{ field: 'notification', message: "Attempted to verify with unknown address" }])
      .flashAll()
      return response.redirect('back')
    } else {
      if(elite.username && elite.username != request.input('username')){
        session
        .withErrors([{ field: 'notification', message: "Attempted to verify with unknown username" }])
        .flashAll()
        return response.redirect('back')
      }
      
      var result = false
      
      try{
        result = bitcoinMessage.verify(elite.challenge.toString(), this.wallet.derriveAddressFromPublicKey(elitePublicKey).toLowerCase(), eliteSignature)
      } catch (e){
        console.log("error: ")
        console.log(e)
      }

      if(result){
        console.log(result)
        if(request.input('username'))
          elite.username = request.input('username')
        if(request.input('picture'))
          elite.picture = request.input('picture')
        if(request.input('email'))
          elite.email = request.input('email')
        if(request.input('refund'))
          elite.refundAddress = request.input('refund')
        await elite.save()
        session.flash({ notification: 'logged in successfully'})
        console.log(elite.address + " logged in")
        await auth.login(elite)
        
        return response.redirect('/')
      } else {
        console.log("ALER! Signature check failed for " + elite.address)
        session
        .withErrors([{ field: 'notification', message: 'Bitcoin signature check failed.' }])
        .flashAll()
        return response.redirect('back')
      }
    }
  }

  async logout ({ auth, response }) {
    await auth.logout()
    return response.redirect('/')
  }

  async signTx({view, request}){
    const url = request.url()
    const tx = url.split("/")[2]
    return view.render('login.signTx', {transactionData: tx})
  }

  async broadcastTx({response, request}){
    const tx = request.input('tx')
    if(!tx){ return }
    this.wallet.broadcastTx(tx).reject((reason)=>{console.log(`failed to broadcast tx: ${tx}\r\n${reason}`)})
    return view.redirect('/offers')
  }

  generate(n) {
    var add = 1, max = 12 - add;   // 12 is the min safe number Math.random() can generate without it starting to pad the end with zeros.   

    if ( n > max ) {
            return this.generate(max) + this.generate(n - max);
    }

    max        = Math.pow(10, n+add);
    var min    = max/10; // Math.pow(10, n) basically
    var number = Math.floor( Math.random() * (max - min + 1) ) + min;

    return ("" + number).substring(add); 
  }
}

module.exports = LoginController
