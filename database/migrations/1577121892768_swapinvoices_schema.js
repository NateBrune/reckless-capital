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
      table.string('r_hash', 32).notNullable()
      table.integer('satoshis').notNullable()
      table.boolean('paid').notNullable()
      
      table.timestamps()
    })
  }

  down () {
    this.drop('swapinvoices')
  }
}

module.exports = SwapinvoicesSchema
