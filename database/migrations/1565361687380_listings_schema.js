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
      table.string('sellerPublicKey').notNullable()
      table.string('sellerAddress').notNullable()
      table.integer('hasLSAT').unsigned()
      table.integer('wantsLSAT').unsigned()
      table.string('username')
      table.string('picture')

      table.string('buyerPublicKey')
      table.string('buyerAddress')

      table.boolean('accepted').notNullable()
      table.boolean('pendingAccept').notNullable()
      table.boolean('inMempool').notNullable()
      table.boolean('funded').notNullable()
      table.string('fundingTransactionHash')
      table.integer('fundingTransactionVout')
      table.integer('fundingTransactionAmount') //satoshis
      table.string('output')
      table.string('redeemScript')
      table.string('fundingAddress')
      table.timestamps()
    })
  }

  down () {
    this.drop('listings')
  }
}

module.exports = ListingsSchema
