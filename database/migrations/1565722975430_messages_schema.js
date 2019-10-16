'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class MessagesSchema extends Schema {
  up () {
    this.create('messages', (table) => {
      table.increments()
      table.integer('aboutListing', 64).unique()
      table.string('senderUsername', 64)
      table.string('senderAddress', 64).notNullable()
      table.string('senderPicture', 128)
      table.string('receiverUsername', 64)
      table.string('receiverAddress', 64).notNullable()
      table.boolean('archived').notNullable()
      table.string('receiverPicture', 128)
      table.integer('msgType').unsigned()
      table.string('message', 1024)

      table.timestamps()
    })
  }

  down () {
    this.drop('messages')
  }
}

module.exports = MessagesSchema
