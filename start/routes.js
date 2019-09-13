'use strict'

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
|
| Http routes are entry points to your web application. You can create
| routes for different URL's and bind Controller actions to them.
|
| A complete guide on routing is available here.
| http://adonisjs.com/docs/4.1/routing
|
*/

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')

Route.get('/', 'ListingController.index')
Route.get('new', 'ListingController.new').middleware('auth')
Route.post('listLSAT', 'ListingController.store').middleware('auth')
Route.delete('listings/:id', 'ListingController.destroy').middleware('auth')
Route.get('login', 'LoginController.index').middleware('guest')
Route.get('challenge/:address', 'LoginController.challenge')
Route.post('verify', 'LoginController.verify').middleware('guest')
Route.get('logout', 'LoginController.logout').middleware('auth')
Route.get('settings', 'LoginController.settings').middleware('auth')
Route.post('settings', 'LoginController.updateprofile').middleware('auth')
Route.get('messages', 'MailController.index').middleware('auth')
Route.post('sendMsg', 'MailController.sendMsg').middleware('auth')
Route.post('sendMsg/:id', 'MailController.sendMsg').middleware('auth')
Route.get('offers', 'MailController.offers').middleware('auth')
Route.delete('deleteMsg/:id', 'MailController.destroy').middleware('auth')
Route.get('declineListing/:id', 'ListingController.declineListing').middleware('auth')
Route.get('plsSignTx/:tx', 'LoginController.signTx').middleware('auth')
Route.post('broadcastTx', 'LoginController.broadcastTx').middleware('auth')
Route.post('walletnotify', 'ListingController.walletnotify')