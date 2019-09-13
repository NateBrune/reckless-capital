const bitcoin = require('bitcoinjs-lib')
var bitcoinMessage = require('bitcoinjs-message')
const TESTNET = bitcoin.networks.testnet

window.derivePubKey = function (username, password, count){
  const brainsrc = username.concat(password) // Strings
  do {
    hash = bitcoin.crypto.sha256(Buffer.from(brainsrc))
    count--
  } while(count>0)

  const keyPair = bitcoin.ECPair.fromPrivateKey(hash)
  //this.console.log(keyPair)
  return keyPair.publicKey.toString('hex')
  const addr = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey }).address
  //const secret = keyPair.toWIF()
  return addr
}

window.deriveAddress = function (username, password, count){
  const brainsrc = username.concat(password) // Strings
  do {
    hash = bitcoin.crypto.sha256(Buffer.from(brainsrc))
    count--
  } while(count>0)

  const keyPair = bitcoin.ECPair.fromPrivateKey(hash)
  //this.console.log(keyPair)

  //const addr = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: TESTNET }).address
  const addr = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: bitcoin.networks.regtest }).address
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
  //var signature = bitcoinMessage.sign(message, privateKey, keyPair.compressed, { segwitType: 'p2wpkh',  network: TESTNET })
  var signature = bitcoinMessage.sign(message, privateKey, keyPair.compressed, { segwitType: 'p2wpkh',  network: bitcoin.networks.regtest })

  return signature
}

window.signTx = function(wif, tx){
  const keyPair = bitcoin.ECPair.fromWIF(wif)
  const signer = bitcoin.Psbt.fromHex(tx);
  signer.signAllInputs(keyPair);
  return signer.toHex()

}