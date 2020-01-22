'use strict'
const bitcoin = require('bitcoinjs-lib')
const { RegtestUtils } = require('regtest-client')
const Client = require('bitcoin-core')
const LndGrpc = require('lnd-grpc')
const Logger = use('Logger')
var Env = use('Env')

const Listing = use('App/Models/Listing')
const Message = use('App/Models/Message')
const User = use('App/Models/User')
const Swapinvoice = use('App/Models/Swapinvoice')

const serverWif = Env.get('SERVER_WIF')
const BTCD_HOST = Env.get('BTCD_HOST')
const BTCD_PORT = Env.get('BTCD_PORT')
const BTCD_USERNAME = Env.get('BTCD_USERNAME')
const BTCD_PASSWORD = Env.get('BTCD_PASSWORD')
const LND_HOST = Env.get('LND_HOST')
const LND_CERT = Env.get('LND_CERT')
const LND_MACAROON = Env.get('LND_MACAROON')
const SERVERADDRESS = Env.get('SERVER_ADDRESS')
const TESTNET = bitcoin.networks.testnet

const client = new Client({
  network: 'testnet',
  host: BTCD_HOST,
  //port: 8332,
  port: BTCD_PORT,
  username: BTCD_USERNAME,
  password: BTCD_PASSWORD,
  version: '0.9.0'
});

//client.set('user', 'bitcoinrpc')

// bitcoin = require('../..')
//const APIPASS = process.env.APIPASS || 'satoshi'
//const APIURL = process.env.APIURL || 'https://regtest.bitbank.cc/1'

//const regtestUtils = new RegtestUtils(bitcoin, { APIPASS, APIURL })
//const regtest = regtestUtils.network;

class BtcWalletController {
  constructor(){
    this.grpc = null
    //this.connectToLnd()
  }

  async connectToLnd(){
    if(this.grpc === null){
      this.grpc = new LndGrpc({
        host: LND_HOST,
        cert: LND_CERT,
        macaroon: LND_MACAROON,
      })

      await this.grpc.connect()
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

  async getNodeInfo(pubkey){
    await this.connectToLnd()
    const { Lightning } = this.grpc.services
    try{
      var info = await Lightning.getNodeInfo({pub_key: pubkey, include_channels: true})
      return info
    } catch(e){ 
      throw e
    }
  }

  async connectPeerLND(lnaddress){
    await this.connectToLnd()
    const { Lightning } = this.grpc.services

    try{
      var info = await Lightning.connectPeer({addr: {pubkey: lnaddress.split('@')[0], host:  lnaddress.split('@')[1]}})
      //console.log(info)
      return true
    } catch(e){
      if(e.message.includes('already connected to peer') || e.message.includes('cannot make connection to self')){
        return true
      } else {
        return false
      }
    }
  }

  async lookupInvoice(hash){
    await this.connectToLnd()
    const { Lightning } = this.grpc.services

    await this.connectToLnd()
    //var hashb64 = invoiceBuffer.toString('base64')
    //console.log(invoiceb64)
    var request = {
      r_hash: hash
    }
    var promise = new Promise((resolve, reject) => {
      //console.log(Lightning)
      Lightning.lookupInvoice(request, function(err, response) {
        if(err){
          reject(err)
        }
        resolve(response)
      })
    })
    return await promise
  }

  async decodePaymentRequest(lnrequest){
    await this.connectToLnd()
    const { Lightning } = this.grpc.services
    
    var request = { 
      pay_req: lnrequest
    }

    var promise = new Promise((resolve, reject) => {
      Lightning.decodePayReq(request, function(err, response) {
        if(err){
          reject(err)
        }
        resolve(response)
      })
    })

    return await promise
  }

  async getInfo(){
    await this.connectToLnd()
    const { Lightning } = this.grpc.services
    var promise = new Promise((resolve, reject) => {
      Lightning.getInfo({}, function(err, response) {
        if(err){
          reject(err)
        }
        resolve(response)
      })
    })
    return await promise
  }



  async addInvoice(satoshis, memo = null){
    await this.connectToLnd()
    const { Lightning } = this.grpc.services
    if(memo){
      return await Lightning.addInvoice({ value: satoshis, memo: memo })
    } else {
      return await Lightning.addInvoice({ value: satoshis })
    }
  }

  async payInvoice(lnInvoice, maxSatoshis = 0, feelimit = 0){
    await this.connectToLnd()
    const { Lightning } = this.grpc.services

    const invoice = await this.decodePaymentRequest(lnInvoice)
    if(!invoice){
      return Error("Invalid invoice.")
    }
    const invoiceRequestedSatoshis = invoice['num_satoshis']

    if(invoiceRequestedSatoshis==0 || invoiceRequestedSatoshis <= maxSatoshis){
      // Reject invoice if it's billing for more than the maxSatoshis
      


      var paymentAmount = invoiceRequestedSatoshis
      if(invoiceRequestedSatoshis == 0){
        paymentAmount = maxSatoshis
      }

      var request = { 
        amt: paymentAmount, 
        payment_request: lnInvoice,
        fee_limit: {'fixed': 50} // TODO Get this in the config
      }
      const promise = new Promise(async resolve => {
        Lightning.sendPaymentSync(request, function(err, response){
          if(err){
            Logger.crit("Lightning payment error!")
            reject(err)
          }
          resolve(response)
        })
      })
      return await promise
    } else {
      return Error("Invoice too large.")
    }
  }

  async resolveOnInvoice(){
    this.connectToLnd()
    const { Lightning } = this.grpc.services
    
    var call = Lightning.subscribeInvoices()

    const promise = new Promise(async resolve => {
      call.on('error', function(error) {
        if (error.code === status.CANCELLED) {
          return reject()
        }
      })
      call.on('data', function(response) {
        // A response was received from the server.
        resolve(response)
      });
      call.on('status', function(status) {
        // The current status of the stream.
        resolve(status)
      });
      call.on('end', function() {
        // The server has closed the stream.
        resolve()
      });
    })
    return await promise
  }

  deriveServerKeyPair(id){
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
    const serverKeyPair = this.deriveServerKeyPair(listing.id)
    
    /* Generate a P2WSH ( Pay-to-Multisig 2-of-3 )
      Keys involved are the server, buyer, and seller's respective keys. */
    var redeemscript = null
    var pubkeys = [
      serverKeyPair.publicKey.toString('hex'),
      eliteBuyerPubKey,
      eliteSellerPubKey
    ].map((hex) => Buffer.from(hex, 'hex'))


    //redeemscript = bitcoin.payments.p2ms({ m: 2, pubkeys, network: bitcoin.networks.regtest })
    redeemscript = bitcoin.payments.p2ms({ m: 2, pubkeys, network: TESTNET })
    var p2wshTx = bitcoin.payments.p2wsh({
      redeem: redeemscript,
      //network: bitcoin.networks.regtest
      network: TESTNET
    })
    listing.output = p2wshTx.output.toString('hex')
    listing.redeemscript = p2wshTx.redeem.output.toString('hex')
    listing.fundingAddress = p2wshTx.address
    listing.pendingAccept = true
    client.importAddress({address: p2wshTx.address, rescan: false})
    return p2wshTx
    
  }

  deriveAddressFromPublicKey(pubkey){
    const publicKeyBuffer = Buffer.from(pubkey, "hex")
    const { address } = bitcoin.payments.p2wpkh({ pubkey: publicKeyBuffer, network: TESTNET })
    //const { address } = bitcoin.payments.p2wpkh({ pubkey: publicKeyBuffer, network: regtest })
    return address
  }

  /* Inheritance broken, function copy-pasted from Stack Overflow Answer */
  async asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

  /* Bitcoind will trigger this function and give it a transaction id. The transaction is first sent once it's in the mempool. 
  It's triggered again once the transaction is confirmed in one block. */
  
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
            //console.log(totalpay + ":" + listing.stipend + listing.servicefee)
            if(totalpay <= detail['amount']){
              if(listing.inMempool == false && listing.funded == false){
                listing.inMempool = true
                listing.lastChanceToFund = false // for us to filter it out later in Lighting Routine
                listing.save()
                message.message = "mempool"
                message.save()
                console.log("payment found in mempool!")
                return
              } else if(listing.inMempool == true && listing.funded == false) {
                listing.inMempool = false
                listing.funded = true
                listing.fundingTransactionHash = txid
                listing.fundingTransactionVout = detail['vout']
                // I wish javascript had macros....
                listing.fundingTransactionAmount = Math.round(new Number(detail['amount']) * 100000000)
                var totalSats = Math.round(new Number(detail['amount']) * 100000000)
                var extra = totalSats - Math.round(new Number(listing.stipend) * 100000000) - Math.round(new Number(listing.servicefee) * 100000000 ) 
                listing.fundingTransactionExtra = extra
                listing.lastChanceToAccept = ((new Date().getTime() + (24*60*60*1000)) / 1000).toFixed(0)
                console.log("funded: "+ listing.fundingTransactionAmount)
                listing.save()
                message.message = "funded"
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
          }
        })
    } catch (e){
      Logger.crit(e)
    }
  }

  async refundListing(id, refundAddress, resetListing, reputation = 0){
    console.log("looking up listing: "+ id)
    var listing = await Listing.find(id)
    if(listing == null ) { return new Error("Invalid listing id specified. Couldn't find listing.")}
    const serverKeyPair = this.deriveServerKeyPair(id)
    //const psbt = new bitcoin.Psbt({ network: regtest })
    const psbt = new bitcoin.Psbt({ network: TESTNET })
    psbt.setVersion(2); // These are defaults. This line is not needed.
    psbt.setLocktime(0); // These are defaults. This line is not needed.
    console.log("input value: " + listing.fundingTransactionAmount)

    // Pay stipend
    var stipendSats = Math.round(new Number(listing.stipend) * 100000000)
    var feeSats = Math.round(new Number(listing.servicefee) * 100000000)
    var extraSats = new Number(listing.fundingTransactionExtra)
    var totalSats = stipendSats + feeSats + extraSats
    var minfee = Math.round(totalSats * 0.00001) //relayfee on mainnet TODO: fix fee calculation
    //console.log(`${stipendSats} ${feeSats} ${extraSats} ${totalSats} ${minfee}`)
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
      Logger.crit(e)
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
        await User.query().where({'publicKey': listing.buyerPublicKey}).increment('undisputedTxn', 1)
        break
      case -1:
        await User.query().where({'publicKey': listing.sellerPublicKey}).increment('disputedTxn', 1)
        await User.query().where({'publicKey': listing.buyerPublicKey}).increment('disputedTxn', 1)
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
    try{
      tx.finalizeAllInputs()
      return await client.sendRawTransaction({hexstring: tx.extractTransaction().toHex()})
    } catch(e){
      Logger.crit(e)
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
