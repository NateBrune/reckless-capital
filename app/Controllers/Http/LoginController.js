'use strict'
const User = use('App/Models/User')
const Listing = use('App/Models/Listing')
const Message = use('App/Models/Message')

const BtcWalletController = use('App/Services/BtcWalletController')

//const bitcoin = require('bitcoinjs-lib')
var bitcoinMessage = require('bitcoinjs-message')

class LoginController {

  async index ({ view }) {
    return view.render('login.index')
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
    elite.save()
    console.log(request.input('picture'))
    session.flash({ notification: 'Profile settings saved.'})
    
    await Listing.query().where('sellerAddress', elite.address).update({
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

  async challenge ({ request, session }) {
    const url = request.url()
    const elitePublicKey = url.split("/")[2]
    const wallet = new BtcWalletController()
    console.log("challenge for: "+ wallet.derriveAddressFromPublicKey(elitePublicKey))
    const elite = await User.query().where('publicKey', elitePublicKey).first()
    const challenge = this.generate(128)
    if(elite === null){
      console.log("new user: " + elitePublicKey)
      const eliteAddress = wallet.derriveAddressFromPublicKey(elitePublicKey)
      const user = new User()
      user.username = null
      user.publicKey = elitePublicKey
      user.address = eliteAddress
      user.picture = null
      user.challenge = challenge
      await user.save()
    } else {
      elite.challenge = challenge
      await elite.save()
    }
    return challenge
  }

  async verify ({ auth, request, response, session }) {
    const url = request.url()
    
    const elitePublicKey = request.input('publicKey')
    const eliteSignature = Buffer.from(request.input('signature'))
    console.log("verifying: "+elitePublicKey)
    const elite = await User.query().where('publicKey', elitePublicKey).first()
    if(elite === null){
      //return 'Attempted to verify with unknown address'
      return response.redirect('back')
    } else {
      
      var result = false
      const wallet = new BtcWalletController()
      console.log(wallet.derriveAddressFromPublicKey(elitePublicKey).toLowerCase())
      try{
        result = bitcoinMessage.verify(elite.challenge.toString(), wallet.derriveAddressFromPublicKey(elitePublicKey).toLowerCase(), eliteSignature)
      } catch (e){
        console.log("error: ")
        console.log(e)
      }

      if(result){
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
