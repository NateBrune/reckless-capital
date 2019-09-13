'use strict'
const bitcoin = require('bitcoinjs-lib')
const { RegtestUtils } = require('regtest-client')
const Client = require('bitcoin-core');

const Listing = use('App/Models/Listing')
const Message = use('App/Models/Message')
const Env = use('Env')
const serverWif = Env.get('SERVER_WIF')


const TESTNET = bitcoin.networks.testnet
const client = new Client({
  network: 'regtest',
  host: '127.0.0.1',
  port: 8332,
  username: 'bitcoins',
  password: 'rule',
  version: '0.18.0'
});

//client.set('user', 'bitcoinrpc')

// bitcoin = require('../..')
const APIPASS = process.env.APIPASS || 'satoshi'
const APIURL = process.env.APIURL || 'https://regtest.bitbank.cc/1'

const regtestUtils = new RegtestUtils(bitcoin, { APIPASS, APIURL })
const regtest = regtestUtils.network;

class BtcWalletController {

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
            const message = await Message.query().where('aboutListing', listing.id).first()
            if(message === null ) { console.log("recieved payment, but couldn't find buy message. Bad sign!?"); return }
            //console.log(detail)
            if(listing.stipend <= detail['amount']){
              if(listing.inMempool == false && listing.funded == false){
                listing.inMempool = true
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
                listing.fundingTransactionAmount = new Number(detail['amount']) * 100000000
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

  async refundListing(id, refundAddress){
    const listing = await Listing.find(id)
    if(listing == null ) { return new Error("Invalid listing id specified. Couldn't find listing.")}
    const FEE = 100009
    const serverKeyPair = this.derriveServerKeyPair(id)
    const psbt = new bitcoin.Psbt({ network: regtest })
    psbt.setVersion(2); // These are defaults. This line is not needed.
    psbt.setLocktime(0); // These are defaults. This line is not needed.
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
    psbt.addOutput({
      address: refundAddress,
      value: listing.fundingTransactionAmount - FEE,
    });
    //console.log(listing)
    psbt.signInput(0, serverKeyPair);
    return psbt.toHex()
  }

  broadcastTx(hexTx){
    const tx = bitcoin.Psbt.fromHex(hexTx)
    console.log('tx sigs valid: ' + tx.validateSignaturesOfAllInputs())
    console.log("and now for what you've all been waiting for: ")
    try{
      tx.finalizeAllInputs()
      console.log("tx is valid >:)")
      const result = client.sendRawTransaction({hexstring: tx.extractTransaction().toHex()})
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
