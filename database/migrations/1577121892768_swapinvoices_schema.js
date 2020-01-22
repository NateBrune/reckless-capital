'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class SwapinvoicesSchema extends Schema {
  up () {
    this.create('swapinvoices', (table) => {
      table.increments()
      table.string('invoice', 128).notNullable()
      table.string('returnAddress', 64).notNullable()
      table.integer('addIndex').notNullable()
      table.string('r_hash', 32).notNullable().unique()
      table.integer('satsRequested').notNullable()
      table.integer('satsPaid').notNullable()
      table.boolean('paid').notNullable()
      table.boolean('refunded').notNullable()
      table.string('swapid').unique()
      table.string('htlc_address').unique()
      table.integer('cost_server')
      table.integer('cost_onchain')
      table.integer('cost_offchain')
      table.integer('fee')
      table.string('status')
      table.timestamps()
    })
  }

  down () {
    this.drop('swapinvoices')
  }
}

module.exports = SwapinvoicesSchema
