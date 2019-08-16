'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class ListingsSchema extends Schema {
  up () {
    this.create('listings', (table) => {
      table.increments()
      table.string('owner').notNullable()
      table.integer('hasLSAT').unsigned()
      table.integer('wantsLSAT').unsigned()
      table.integer('stipend').notNullable().unsigned()
      table.string('elite').notNullable()
      table.string('username')
      table.string('picture')
      table.boolean('pendingAccept').notNullable()
      table.boolean('accepted').notNullable()
      table.string('buyerAddress')
      table.integer('initiated')
      table.timestamps()
    })
  }

  down () {
    this.drop('listings')
  }
}

module.exports = ListingsSchema
