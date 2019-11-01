'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class ListingsSchema extends Schema {
  up () {
    this.create('listings', (table) => {
      table.increments()
      // Seller
      table.string('sellerNodePublicKey').notNullable()
      table.integer('stipend').notNullable().unsigned()
      table.integer('servicefee').notNullable().unsigned()
      table.integer('sellerPeriod').notNullable().unsigned()
      table.string('sellerPublicKey').notNullable()
      table.string('sellerAddress').notNullable()
      table.integer('hasLSAT').unsigned()
      table.integer('wantsLSAT').unsigned()
      table.string('username')
      table.string('picture')

      table.string('buyerNodePublicKey')
      table.string('buyerPublicKey')
      table.string('buyerAddress')

      table.boolean('accepted').notNullable()
      table.string('lastChanceToFund')
      table.string('lastChanceToAccept')
      table.string('lastChanceToOpenChannel')
      table.string('channelMustBeOpenUntil')
      table.boolean('channelOpen').notNullable()
      table.boolean('sellerRedeemable').notNullable() // opened channel and held open for entire term.
      table.boolean('buyerRedeemable').notNullable() // opened channel and held open for entire term.
      table.integer('consecutiveFailedCheckups').notNullable() // used to keep seller of liqiudity honest
      table.boolean('redeemed').notNullable() // paid out
      table.boolean('pendingAccept').notNullable()
      table.boolean('inMempool').notNullable()
      table.boolean('funded').notNullable()
      table.string('fundingTransactionHash')
      table.integer('fundingTransactionVout')
      table.integer('fundingTransactionAmount') //satoshis
      //table.integer('fundingTransactionStipend') //satoshis
      //table.integer('fundingTransactionServiceFee') //satoshis
      table.integer('fundingTransactionExtra') //satoshis
      table.string('output')
      table.string('redeemScript')
      table.string('fundingAddress')
      table.boolean('archived').notNullable()
      
      table.timestamps()
    })
  }

  down () {
    this.drop('listings')
  }
}

module.exports = ListingsSchema
