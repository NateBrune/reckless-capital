const bitcoin = require('bitcoinjs-lib')
var bitcoinMessage = require('bitcoinjs-message')


window.derivePubKey = function (username, password, count){
  const brainsrc = username.concat(password) // Strings
  do {
    hash = bitcoin.crypto.sha256(Buffer.from(brainsrc))
    count--
  } while(count>0)

  const keyPair = bitcoin.ECPair.fromPrivateKey(hash)
  //this.console.log(keyPair)
  const addr = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey }).address
  //const secret = keyPair.toWIF()
  
  return addr
}

window.derivePrivateKey = function (username, password, count){
  const brainsrc = username.concat(password) // Strings
  do {
    hash = bitcoin.crypto.sha256(Buffer.from(brainsrc))
    count--
  } while(count>0)

  const keyPair = bitcoin.ECPair.fromPrivateKey(hash)
  //this.console.log(keyPair)
  //const addr = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey }).address
  const secret = keyPair.toWIF()
  
  return secret
}

window.signString = function (wif, message){
  const keyPair = bitcoin.ECPair.fromWIF(wif)
  var privateKey = keyPair.privateKey
  var signature = bitcoinMessage.sign(message, privateKey, keyPair.compressed, { segwitType: 'p2wpkh' })
  
  return signature
}