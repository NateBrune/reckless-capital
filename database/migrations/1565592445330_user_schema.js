'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class UserSchema extends Schema {
  up () {
    this.create('users', (table) => {
      table.increments()
      table.string('username', 64).unique()
      table.string('publicKey', 128).notNullable().unique()
      table.string('refundAddress', 64)
      table.string('address', 64)
      table.string('email', 128)
      table.string('picture', 128)
      //table.string('challenge', 128)
      table.integer('undisputedTxn')
      table.integer('disputedTxn')
      table.boolean('hasMail', false)
      table.boolean('hasOffer', false)
      table.timestamps()
    })
  }

  down () {
    this.drop('users')
  }
}

module.exports = UserSchema
