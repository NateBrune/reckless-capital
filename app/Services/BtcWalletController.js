'use strict'
const bitcoin = require('bitcoinjs-lib')
const { RegtestUtils } = require('regtest-client')
const Client = require('bitcoin-core')
const LndGrpc = require('lnd-grpc')
var Env = use('Env')

const Listing = use('App/Models/Listing')
const Message = use('App/Models/Message')
const User = use('App/Models/User')

const serverWif = Env.get('SERVER_WIF')
const HOST = Env.get('BTCD_HOST')
const PORT = Env.get('BTCD_PORT')
const PASS = Env.get('LND_PASS')
const SERVERADDRESS = Env.get('SERVER_ADDRESS')
const TESTNET = bitcoin.networks.testnet
const client = new Client({
  network: 'regtest',
  host: HOST,
  //port: 8332,
  port: PORT,
  username: 'lnd',
  password: 'lightning',
  version: '0.18.1'
});

//client.set('user', 'bitcoinrpc')

// bitcoin = require('../..')
const APIPASS = process.env.APIPASS || 'satoshi'
const APIURL = process.env.APIURL || 'https://regtest.bitbank.cc/1'

const regtestUtils = new RegtestUtils(bitcoin, { APIPASS, APIURL })
const regtest = regtestUtils.network;

class BtcWalletController {
  constructor(){
    this.grpc = null
  }

  async connectToLnd(){
    if(this.grpc === null){
      this.grpc = new LndGrpc({
        host: 'localhost:10009',
        cert: '~/app-container/.lnd/tls.cert',
        macaroon: '~/app-container/.lnd/data/chain/bitcoin/regtest/admin.macaroon',
      })

      await this.grpc.connect()
      console.log("grpc state: " + this.grpc.state)
    }
  }

  async unlockLndWallet(){
    // non-functional Error: invalid passphrase for master public key
    /*
    const { WalletUnlocker } = this.grpc.services
    console.log("unlockwallet state: " + this.grpc.state)
    if (this.grpc.state === "locked") {
      await WalletUnlocker.unlockWallet({ wallet_password: PASS })
    
      console.log("State of unlock: " + this.grpc.state) // active
    }
    */
  }

  async getInfo(){
    const { Lightning } = this.grpc.services
    var info = await Lightning.getInfo()
    console.log("getInfo: " + info)
  }

  async getNodeInfo(pubkey){
    const { Lightning } = this.grpc.services
    try{
      var info = await Lightning.getNodeInfo({pub_key: pubkey, include_channels: true})
      return info
    } catch(e){ 
      throw e
    }
    
    
  }

  async connectPeerLND(lnaddress){
    const { Lightning } = this.grpc.services
    //console.log(Lightning)
    try{
      var info = await Lightning.connectPeer({addr: {pubkey: lnaddress.split('@')[0], host:  lnaddress.split('@')[1]}})
      console.log(info)
      return true
    } catch(e){
      if(e.message.includes('already connected to peer') || e.message.includes('cannot make connection to self')){
        return true
      } else {
        return false
      }
    }
    
    console.log("connectpeer: " + info)
  }

  derriveServerKeyPair(id){
    if(id == null) { except("id cannot be null!")}

    var hash = null
    var count = 64
    do {
      hash = bitcoin.crypto.sha256(Buffer.from(serverWif + id))
      count--
    } while(count>0)
    return bitcoin.ECPair.fromPrivateKey(hash)
  }

  appendP2WSHtoListing(listing, eliteBuyerPubKey, eliteSellerPubKey) {
    const serverKeyPair = this.derriveServerKeyPair(listing.id)
    
    // Generate a P2WSH ( Pay-to-Multisig 2-of-3 )
    var redeemscript = null
    var pubkeys = [
      serverKeyPair.publicKey.toString('hex'),
      eliteBuyerPubKey,
      eliteSellerPubKey
    ].map((hex) => Buffer.from(hex, 'hex'))
    //redeemscript = bitcoin.payments.p2ms({ m: 2, pubkeys, network: TESTNET })
    redeemscript = bitcoin.payments.p2ms({ m: 2, pubkeys, network: bitcoin.networks.regtest })
    var p2wshTx = bitcoin.payments.p2wsh({
      redeem: redeemscript,
      network: bitcoin.networks.regtest
      //network: TESTNET
    })
    //console.log(p2wshTx)
    //console.log("output: " + p2wshTx.output.toString('hex'))
    //console.log("redeem.output: " + p2wshTx.redeem.output.toString('hex'))
    //console.log("witness: " + p2wshTx.witness)
    listing.output = p2wshTx.output.toString('hex')
    listing.redeemscript = p2wshTx.redeem.output.toString('hex')
    listing.fundingAddress = p2wshTx.address
    listing.pendingAccept = true
    //client.importAddress(p2wshTx.address, 'false')
    client.importAddress({address: p2wshTx.address, rescan: false})
    return p2wshTx
    
  }

  derriveAddressFromPublicKey(pubkey){
    const publicKeyBuffer = Buffer.from(pubkey, "hex")
    //const { address } = bitcoin.payments.p2wpkh({ pubkey: publicKeyBuffer, network: TESTNET })
    const { address } = bitcoin.payments.p2wpkh({ pubkey: publicKeyBuffer, network: regtest })
    return address
  }

  /* Inheritence broken, function copy-pasted from another class */
  async asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

  async walletNotify(txid){
    try{
        const transaction = await client.getTransaction(txid, true);
        const details = transaction['details']
        this.asyncForEach(details, async function (detail) {
          if(detail['category'] == 'receive'){
            const listing = await Listing.query().where('fundingAddress', detail['address']).first()
            if(listing === null ) { console.log("recieved payment, but not to our address, break"); return }
            const message = await Message.query().where({'aboutListing': listing.id, 'archived': false}).first()
            if(message === null ) { console.log("recieved payment, but couldn't find buy message. Bad sign!?"); return }
            //console.log(detail)
            var totalpay = new Number(listing.stipend + listing.servicefee).toFixed(8)
            console.log(totalpay + ":" + listing.stipend + listing.servicefee)
            if(totalpay <= detail['amount']){
              if(listing.inMempool == false && listing.funded == false){
                listing.inMempool = true
                listing.lastChanceToFund = false // for us to filter it out later in Lighting Routine
                listing.save()
                message.message = "mempool:"+listing.fundingAddress+":"+listing.redeemScript
                message.save()
                console.log("payment found in mempool!")
                return
              } else if(listing.inMempool == true && listing.funded == false) {
                listing.inMempool = false
                listing.funded = true
                listing.fundingTransactionHash = txid
                listing.fundingTransactionVout = detail['vout']
                listing.fundingTransactionAmount = Math.round(new Number(detail['amount']) * 100000000)
                var totalSats = Math.round(new Number(detail['amount']) * 100000000)
                var extra = totalSats - Math.round(new Number(listing.stipend) * 100000000) - Math.round(new Number(listing.servicefee) * 100000000 ) 
                listing.fundingTransactionExtra = extra
                listing.lastChanceToAccept = ((new Date().getTime() + (5*60*1000)) / 1000).toFixed(0)//(24*60*60*1000)) / 1000).toFixed(0)
                console.log("funded: "+ listing.fundingTransactionAmount)
                listing.save()
                message.message = "funded:"+listing.fundingAddress+":"+listing.redeemScript
                message.save()
                return
              } else {
                // user paid twice :(
                console.log(detail['amount']*100000000 + " satoshis lost just like that... (paid twice)")
                return
              }
            } else {
                // user sent incorrect quantity of satoshis:(
                console.log(detail['amount']*100000000 + " satoshis lost just like that... (incorrect quantity)")
                return
            }

            return new Error("should never reach here PLS NO REACH")
          }
        })
    } catch (e){
      console.log(e)
    }
  }

  async refundListing(id, refundAddress, resetListing, reputation = 0){
    console.log("looking up listing: "+ id)
    var listing = await Listing.find(id)
    if(listing == null ) { return new Error("Invalid listing id specified. Couldn't find listing.")}
    const serverKeyPair = this.derriveServerKeyPair(id)
    const psbt = new bitcoin.Psbt({ network: regtest })
    psbt.setVersion(2); // These are defaults. This line is not needed.
    psbt.setLocktime(0); // These are defaults. This line is not needed.
    console.log("input value: " + listing.fundingTransactionAmount)

    // Pay stipend
    var stipendSats = Math.round(new Number(listing.stipend) * 100000000)
    var feeSats = Math.round(new Number(listing.servicefee) * 100000000)
    var extraSats = new Number(listing.fundingTransactionExtra)
    var totalSats = stipendSats + feeSats + extraSats
    var minfee = Math.round(totalSats * 0.00001) //relayfee on mainnet TODO: fix fee calculation
    console.log(`${stipendSats} ${feeSats} ${extraSats} ${totalSats} ${minfee}`)
    var FEE = (1*180 + 2*34 + 10)*5
    console.log(`fee set to: ${FEE}, could be set to ${minfee}`)
    psbt.addInput({
      hash: listing.fundingTransactionHash,
      index: listing.fundingTransactionVout, //0,
      sequence: 0xffffffff, // These are defaults. This line is not needed.
      witnessUtxo: {
        script: Buffer.from(
          listing.output,
          'hex',
        ),
        value: listing.fundingTransactionAmount,
      },
      //redeemScript: Buffer.from(listing.redeemScript, "hex"),
      witnessScript: Buffer.from(listing.redeemScript, "hex")
      // Not featured here:
      //   redeemScript. A Buffer of the redeemScript for P2SH
      //   witnessScript. A Buffer of the witnessScript for P2WSH
    });
    try{
      if(resetListing){
        console.log("no servicefee: refunding for " + totalSats + " - network fee("+FEE+")")
        psbt.addOutput({
          address: refundAddress,
          value: totalSats - FEE
        })
      } else {
        var customerSats = stipendSats + extraSats - FEE
        console.log(`customer profits ${customerSats} we profit ${feeSats}`) 
        var customerRefundOutput = {
          address: refundAddress,
          value: customerSats
        }
        var serviceFeeOutput = {
          address: SERVERADDRESS,
          value: feeSats
        }
        psbt.addOutputs([customerRefundOutput, serviceFeeOutput]);
      }

    } catch (e){
      console.log(e)
      throw e 
    }
    //console.log(listing)
    psbt.signInput(0, serverKeyPair);

    if(resetListing){
      await this.resetListing(id)
    }
      
    //await Message.query().where('aboutListing', id).delete()
    await Message.query().where({'aboutListing': listing.id, 'archived': false}).update({
      archived: true
    })

    switch(reputation) {
      case 0:
        
      case 1:
        await User.query().where({'publicKey': listing.sellerPublicKey}).increment('undisputedTxn', 1)
        break
      case -1:
        await User.query().where({'publicKey': listing.sellerPublicKey}).increment('disputedTxn', 1)
        break
      default:
        break
    } 
    
    return psbt.toHex()
  }

  async resetListing(id){
    var listing = await Listing.find(id)

    //await Message.query().where('aboutListing', id).delete()
    listing.accepted = false
    listing.pendingAccept = false
    listing.inMempool = false
    listing.funded = false
    listing.fundingAddress = null
    listing.fundingTransactionAmount = null
    listing.fundingTransactionVout = null
    listing.fundingTransactionHash = null
    listing.buyerPublicKey = null
    listing.buyerAddress = null
    listing.output = null
    listing.redeemScript = null
    listing.buyerRedeemable = false
    listing.sellerRedeemable = false
    listing.channelOpen = false
    listing.channelMustBeOpenUntil = null
    listing.lastChanceToOpenChannel = null
    listing.lastChanceToAccept = false
    listing.lastChanceToFund = false
    listing.consecutiveFailedCheckups = 0
    await listing.save()
  }

  async broadcastTx(hexTx){
    const tx = bitcoin.Psbt.fromHex(hexTx)
    console.log('tx sigs valid: ' + tx.validateSignaturesOfAllInputs())
    console.log("and now for what you've all been waiting for: ")
    try{
      tx.finalizeAllInputs()
      console.log("tx is valid >:)")
      return await client.sendRawTransaction({hexstring: tx.extractTransaction().toHex()})
    } catch(e){
      console.log(e)
    }
    //client.sendRawTransaction({hexstring: tx})
  }
}
/*
/* duplication cause we are inside a lambda * /
var hash = null
var count = 64
do {
  hash = bitcoin.crypto.sha256(Buffer.from(serverWif + listing.id))
  count--
} while(count>0)
const serverKeyPair = bitcoin.ECPair.fromPrivateKey(hash)
const psbt = new bitcoin.Psbt({ network: regtest })
psbt.setVersion(2); // These are defaults. This line is not needed.
psbt.setLocktime(0); // These are defaults. This line is not needed.
psbt.addInput({
  // if hash is string, txid, if hash is Buffer, is reversed compared to txid
  hash: txid,
  index: detail['vout'], //0,
  sequence: 0xffffffff, // These are defaults. This line is not needed.

  // // If this input was segwit, instead of nonWitnessUtxo, you would add
  // // a witnessUtxo as follows. The scriptPubkey and the value only are needed.
  witnessUtxo: {
    script: Buffer.from(
       listing.output,
       'hex',
    ),
    value: 90000,
  },
  //redeemScript: Buffer.from(listing.redeemScript, "hex"),
  witnessScript: Buffer.from(listing.redeemScript, "hex")
  // Not featured here:
  //   redeemScript. A Buffer of the redeemScript for P2SH
  //   witnessScript. A Buffer of the witnessScript for P2WSH
});
psbt.addOutput({
  address: '2NEBfnBnops1dXEi9jedcpng7zzZghbz2FR',
  value: 1337,
});
//console.log(listing)
psbt.signInput(0, serverKeyPair);
*/
module.exports = BtcWalletController
