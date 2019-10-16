const bitcoin = require('bitcoinjs-lib')
let bip32 = require('bip32')

var bitcoinMessage = require('bitcoinjs-message')
var secureRandom = require('secure-random')
const bip39 = require('bip39')
const TESTNET = bitcoin.networks.testnet

window.generateMnemonic = function() {
  var mnemonic = bip39.entropyToMnemonic(secureRandom.randomBuffer(32))
  return mnemonic
}

window.saveMnemonicWif = function(mnemonic) {
  var path = "m/84'/0'/0'/0/0" 
  const seed = bip39.mnemonicToSeedSync(mnemonic.toString());
  const node = bip32.fromSeed(seed);
  var child = node.derivePath(path)
  //var keyPair = bitcoin.ECPair.fromWIF(child.toWIF())
  this.localStorage.setItem('publicKey', window.getPublicKeyFromSeed(seed))
  this.localStorage.setItem('privateKey', child.toWIF())
}

window.getMnemonicFromSeed = function(mnemonic) {
  var mnemonic = bip39.seedToMnemonic(mnemonic)
  return mnemonic
}

window.getSeedFromMnemonic = async function(mnemonic) {
  var mnemonic = await bip39.mnemonicToSeed(mnemonic).then(bytes => bytes.toString('hex'))
  return mnemonic
}

window.getPublicKeyFromSeed = function(seed){
  var path = "m/84'/0'/0'/0/0"
  try{
  var root = bip32.fromSeed(Buffer.from(seed, 'hex'))
  var child = root.derivePath(path)
  return  child.publicKey.toString('hex')
  } catch(e){
    this.console.log(e)
  }
}

window.getAddressFromSeed = function(seed){
  var path = "m/84'/0'/0'/0/0"
  try{
  //var root = bip32.fromSeed(Buffer.from(seed, 'hex'))
  var seed = bip39.mnemonicToSeedSync(mnemonic);
  var node = bip32.fromSeed(seed);
  var child = node.derivePath(path)
  var addr = bitcoin.payments.p2pkh({ pubkey: child.publicKey, network: bitcoin.networks.regtest }).address
  return addr
  } catch(e){
    this.console.log(e)
  }
}

window.pubkeyToAddress = function(pubkey){
  const addr = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(pubkey, 'hex'), network: bitcoin.networks.regtest }).address
  return addr
}

window.derivePubKey = function (username, password, count){
  const brainsrc = username.concat(password) // Strings
  do {
    hash = bitcoin.crypto.sha256(Buffer.from(brainsrc))
    count--
  } while(count>0)

  const keyPair = bitcoin.ECPair.fromPrivateKey(hash)
  return keyPair.publicKey.toString('hex')
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

window.signWithMnemonic = function (mnemonic, message){
  var path = "m/84'/0'/0'/0/0"
  try{
    const seed = bip39.mnemonicToSeedSync(mnemonic.toString());
    const node = bip32.fromSeed(seed);
    var child = node.derivePath(path)
    //this.console.log(child.toWIF())
    var keyPair = bitcoin.ECPair.fromWIF(child.toWIF())
    var privateKey = keyPair.privateKey
    //this.console.log("signing with public key: "+ child.publicKey.toString('hex'))
    var signature = bitcoinMessage.sign(message, privateKey, keyPair.compressed, { segwitType: 'p2wpkh',  network: bitcoin.networks.regtest })
    return signature.toString('base64')
  } catch(e){
    alert("detected critical error, failed to login. technical details: " + e)
  }
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
  var keyPair = bitcoin.ECPair.fromWIF(wif)
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