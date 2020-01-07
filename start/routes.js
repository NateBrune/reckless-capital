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

Route.get('/', 'HelpController.index')
Route.get('help/:page', 'HelpController.index')
Route.get('help', 'HelpController.index')
Route.get('/listings', 'ListingController.index')
Route.get('new', 'ListingController.new').middleware('auth')
Route.post('listLSAT', 'ListingController.store').middleware('auth')
Route.delete('listings/:id', 'ListingController.destroy').middleware('auth')
Route.get('login', 'LoginController.index').middleware('guest')
Route.get('signup', 'LoginController.signup').middleware('guest')
Route.post('signup', 'LoginController.createAccout').middleware('guest')
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
Route.get('acceptListing/:id', 'ListingController.acceptListing').middleware('auth')
Route.get('plsSignTx/:tx', 'LoginController.signTx').middleware('auth')
Route.post('broadcastTx', 'LoginController.broadcastTx').middleware('auth')
Route.post('walletnotify', 'ListingController.walletnotify')
Route.get('withdrawFrom/:id', 'ListingController.withdrawFrom').middleware('auth')
Route.get('profile/:key', 'LoginController.viewProfile')
Route.get('/swap', 'SwapController.index')
Route.post('/swap', 'SwapController.requestSwapOut')
Route.get('/swapstatus/:id', 'SwapController.swapStatus')
Route.get('/v1/swapstatus/:id', 'ApiController.swapStatus')