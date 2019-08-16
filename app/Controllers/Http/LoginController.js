'use strict'
const User = use('App/Models/User')
const Listing = use('App/Models/Listing')
const Message = use('App/Models/Message')

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

    const elite = await auth.getUser()
    elite.username = request.input('username')
    elite.picture = request.input('picture')
    elite.save()
    session.flash({ notification: 'Profile settings saved.'})
    
    await Listing.query().where('elite', elite.address).update({
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
    const eliteAddress = url.split("/")[2]
    const elite = await User.query().where('address', eliteAddress).first()
    const challenge = this.generate(128)
    if(elite === null){
      const user = new User()
      user.username = null
      user.address = eliteAddress
      user.picture = null
      user.challenge = challenge
      await user.save()
      console.log("created user: " + eliteAddress)
    } else {
      elite.challenge = challenge
      await elite.save()
    }
    return challenge
  }

  async verify ({ auth, request, response, session }) {
    const url = request.url()
    
    const eliteAddress = Buffer.from(request.input('address'))
    const eliteSignature = Buffer.from(request.input('signature'))
    //console.log(eliteSignature)
    const elite = await User.query().where('address', eliteAddress.toString()).first()
    if(elite === null){
      //console.log("elite null")
      session
      .withErrors([{ field: 'brainwallet', message: 'Attempted to verify with unknown address' }])
      .flashAll()
      //return 'Attempted to verify with unknown address'
      return response.redirect('back')
    } else {
      var result = false
      result = bitcoinMessage.verify(elite.challenge.toString(), eliteAddress.toString(), eliteSignature)
      if(result){
        session.flash({ notification: 'logged in successfully'})
        console.log(elite.address + " logged in")
        await auth.login(elite)
        
        return response.redirect('/')
      } else {
        session
        .withErrors([{ field: 'brainwallet', message: 'Bitcoin signature check failed.' }])
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
