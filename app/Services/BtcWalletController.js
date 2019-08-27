'use strict'
const bitcoin = require('bitcoinjs-lib')

const Env = use('Env')
const serverWif = Env.get('SERVER_WIF')
const TESTNET = bitcoin.networks.testnet
const { RegtestUtils } = require('regtest-client')
const Client = require('bitcoin-core');

const client = new Client({
  host: '127.0.0.1',
  port: 5000,
  username: 'bitcoinrpc',
  password: 'somepass'
});

//client.set('user', 'bitcoinrpc')

// bitcoin = require('../..')
const APIPASS = process.env.APIPASS || 'satoshi'
const APIURL = process.env.APIURL || 'https://regtest.bitbank.cc/1'

const regtestUtils = new RegtestUtils(bitcoin, { APIPASS, APIURL })
const regtest = regtestUtils.network;

class BtcWalletController {
  appendP2WSHtoListing(listing, eliteBuyerPubKey, eliteSellerPubKey) {
    var hash = null
    var count = 64
    do {
      hash = bitcoin.crypto.sha256(Buffer.from(serverWif + listing.id))
      count--
    } while(count>0)
    const serverKeyPair = bitcoin.ECPair.fromPrivateKey(hash)
    
    // Generate a P2WSH ( Pay-to-Multisig 2-of-3 )
    var redeemscript = null
    var pubkeys = [
      serverKeyPair.publicKey.toString('hex'),
      eliteBuyerPubKey,
      eliteSellerPubKey
    ].map((hex) => Buffer.from(hex, 'hex'))
    redeemscript = bitcoin.payments.p2ms({ m: 2, pubkeys, network: TESTNET })
    var p2wshTx = bitcoin.payments.p2wsh({
      redeem: redeemscript, 
      network: TESTNET
    })
    listing.redeemscript = p2wshTx.redeem.output.toString('hex')
    listing.fundingAddress = p2wshTx.address
    listing.pendingAccept = true
    client.importAddress(p2wshTx.address)
    return p2wshTx
    
  }

  derriveAddressFromPublicKey(pubkey){
    const publicKeyBuffer = Buffer.from(pubkey, "hex")
    const { address } = bitcoin.payments.p2wpkh({ pubkey: publicKeyBuffer, network: TESTNET })
    return address
  }

  watchAddress(address){
    
  }
}

module.exports = BtcWalletController
