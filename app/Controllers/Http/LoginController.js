'use strict'
const User = use('App/Models/User')
const Listing = use('App/Models/Listing')
const Message = use('App/Models/Message')
const Challenge = use('App/Models/Challenge')
const { validate } = use('Validator')
const BtcWalletController = use('App/Services/BtcWalletController')
const Logger = use('Logger')

//const bitcoin = require('bitcoinjs-lib')
var bitcoinMessage = require('bitcoinjs-message')
var validateAddress = require('bitcoin-address-validation');

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

  async viewProfile({ auth, response, request, view}){
    const url = request.url()
    const profile = url.split("/")[2]
    var elite = await User.query().where('username', profile).fetch()
    if(!elite){
      elite = await User.query().where('publicKey', profile).fetch()
      if(!elite){
        throw `Couldn't find user (${profile})`
      }
    }

    Logger.debug(elite.toJSON()[0])
    return view.render( 'profile.index', {'profile': elite.toJSON()[0]}  )
  }


  async updateprofile ({ auth, session, request, response}) {
    if(request.input('username') != auth.user.username){
      try{
        const usernameCount = await User.query().where('username', request.input('username')).count()
        const total = usernameCount[0]['count(*)']
        if(total > 0){
          session
          .withErrors([{ field: 'notification', message: 'Username taken.' }])
          .flashAll()
          return response.redirect('back')
        }
      } catch(error){
        console.log(error) 
      }
    }
    if(request.input('refundAddress') && !validateAddress(request.input('refundAddress'))){
      session
      .withErrors([{ field: 'notification', message: 'Invalid Bitcoin Address.' }])
      .flashAll()
      return response.redirect('back')
    }
    const elite = await auth.getUser()
    elite.username = request.input('username')
    elite.picture = request.input('picture')
    elite.refundAddress = request.input('refundAddress')
    elite.email = request.input('email')
    elite.bio = request.input('bio')
    elite.save()
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
    if(elitePublicKey.length !== 66){ // length should be 65 for bitcoin public keys but we get 66 chars
      throw Error("Incorrect public key length.")
    }

    try{
      const usernameCount = await User.query().where('username', request.input('username')).count()
      const usernameTotal = usernameCount[0]['count(*)']
      if(usernameTotal)
      {
        const username = await User.query().where('username', request.input('username')).first()
        if(username && username.publicKey != elitePublicKey){
          //throw Error(`Username (${eliteUsername}) doesn't corespond to public key (${elitePublicKey})`)
          throw Error(`Incorrect username (${eliteUsername}) and password`)
        }
      } else { 
        const pubkeyCount = await User.query().where('publicKey', elitePublicKey).count()
        const pubkeyTotal = pubkeyCount[0]['count(*)']
        if(pubkeyTotal)
          //throw Error(`Username (${eliteUsername}) doesn't corespond to public key (${elitePublicKey})`)
          throw Error(`Incorrect username (${eliteUsername}) and password`)
      }
    } catch (e){
      if(e.message === 'Undefined binding(s) detected when compiling SELECT query: select count(*) from `users` where `username` = ?'){
        Logger.crit(`Using initialization bug to get challenge for ${request.input('username')}`)
      } else {
        throw Error(`Server Error ${e}`)
      }
    }


    // end of validation 
    //console.log()
    Logger.debug("challenge for: "+ this.wallet.derriveAddressFromPublicKey(elitePublicKey))
    //const elite = await User.query().where('publicKey', elitePublicKey).first()
    const challenge = this.generate(128)
    await Challenge.query().where('publicKey', elitePublicKey).delete()
    //const userId = await Challenge.table('challenges').insert({publicKey: elitePublicKey, challenge: challenge})
    var newChallenge = new Challenge()
    newChallenge.publicKey = elitePublicKey
    newChallenge.challenge = challenge
    await newChallenge.save()
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

  async usernameTaken(username){
    const usernameCount = await User.query().where('username', username).count()
    return usernameCount[0]['count(*)']
  }

  async verify ({ auth, request, response, session }) {
    const url = request.url()
    const validation = await validate(request.all(), {
      signature: 'required',
      publicKey: 'required',
      username: 'required'
    })
    if(validation.fails()) {
      session.withErrors(validation.messages())
              .flashAll()
      return response.redirect('back')
    }

    const elitePublicKey = request.input('publicKey')
    const eliteSignature = request.input('signature')
    const eliteUsername = request.input('username')

    const usernameCount = await User.query().where('username', request.input('username')).count()
    const usernameTotal = usernameCount[0]['count(*)']
    if(usernameTotal)
    {
      const username = await User.query().where('username', eliteUsername).first()
      if( username && username.publicKey != elitePublicKey){
          //.withErrors([{ field: 'username', message: `Username (${eliteUsername}) doesn't corespond to public key (${elitePublicKey})` }])
          session
          .withErrors([{ field: 'username', message: `Incorrect username (${eliteUsername}) and password` }])
          .flashAll()
          return response.redirect('/login')
        }
    }  else {  
      const pubkeyCount = await User.query().where('publicKey', elitePublicKey).count()
      const pubkeyTotal = pubkeyCount[0]['count(*)']
      if(pubkeyTotal){
          session
          .withErrors([{ field: 'username', message: `Incorrect username (${eliteUsername}) and password` }])
          .flashAll()
          return response.redirect('/login')
      }
    }
    // end of validation

    const challenge = await Challenge.query().where('publicKey', elitePublicKey).first()
    // just check for the challenge, challenge must be set 
    if(!challenge){
      session
      .withErrors([{ field: 'username', message: `Couldn't find matching challenge for your public key (${elitePublicKey})` }])
      .flashAll()
      return response.redirect('/login')
    }

    if(request.input('refund') && !validateAddress(request.input('refund'))){
      session
      .withErrors([{ field: 'notification', message: 'Invalid Bitcoin Address.' }])
      .flashAll()
      return response.redirect('back')
    }

    try{
      var result = bitcoinMessage.verify(challenge.challenge.toString(), this.wallet.derriveAddressFromPublicKey(elitePublicKey), eliteSignature)
      if(result){
        var elite = await User.query().where('publicKey', elitePublicKey).first()
        if(!elite){
          elite = new User()
          elite.publicKey = elitePublicKey
          elite.address = this.wallet.derriveAddressFromPublicKey(elitePublicKey)
          elite.undisputedTxn = 0
          elite.disputedTxn = 0
          elite.hasMail = false
          elite.hasOffer = false

          if(eliteUsername){
            const taken = await this.usernameTaken(eliteUsername)
            if(!taken){
              elite.username = eliteUsername
            } else {
              session.flash({ notification: `Username taken, sorry.`})
              return response.redirect('/')
            }
          }
            
          if(request.input('picture'))
            elite.picture = request.input('picture')
          if(request.input('email'))
            elite.email = request.input('email')
          if(request.input('refund'))
            elite.refundAddress = request.input('refund')
          
          await elite.save() // Finish registration process
        }
        //session.flash({ notification: 'logged in successfully'})
        await auth.login(elite)
        return response.redirect('/')

      } else {
        session
        .withErrors([{ field: 'notification', message: 'Signature check failed.' }])
        .flashAll()
        return response.redirect('back')
      }
    } catch (e){
      Logger.notice(e)
      throw Error(`Challenge: ${challenge.challenge} Generated address: ${this.wallet.derriveAddressFromPublicKey(elitePublicKey)}`) // Facts.
    }




    /*
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
    */
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
    this.wallet.broadcastTx(tx)
    return response.redirect('/offers')
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
