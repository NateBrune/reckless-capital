'use strict'

const Listing = use('App/Models/Listing')
const { validate } = use('Validator')

class ListingController {
    async index ({ view }) {
        const listings = await Listing.all()
        return view.render('listings.index', { listings: listings.toJSON() })
      }

      async new ({ view }) {
        return view.render('listings.new')
      }

      async store ({ auth, request, response, session }) {
        // validate form input
        const validation = await validate(request.all(), {
          owner: 'required|min:65|max:66',
          hasLSAT: 'required|range:0.00000001,10.0',
          stipend: 'required|range:0.00000001,10.0'
        })
      
        // show error messages upon validation fail
        if (validation.fails()) {
          session.withErrors(validation.messages())
                  .flashAll()
          return response.redirect('back')
        }

        try {
          await auth.check()
        } catch (error) {
          session
          .withErrors([{ field: 'notification', message: 'Not Logged in' }])
          .flashAll()
          return response.redirect('back')
        }

        // persist to database
        const elite = await auth.getUser()
        console.log("elite trying to store")
        console.log(elite)
        const listing = new Listing()
        listing.owner = request.input('owner')
        listing.hasLSAT = request.input('hasLSAT')
        listing.wantsLSAT = null
        listing.stipend = request.input('stipend')
        listing.elite = elite.address
        listing.username = elite.username
        listing.picture = elite.picture
        listing.pendingAccept = false
        listing.accepted = false
        await listing.save()
        // Fash success message to session
        session.flash({ notification: 'Listing added!' })
      
        return response.redirect('back')
      }

      async destroy ({ params, session, response, auth }) {
        const listing = await Listing.find(params.id)
        console.log(listing.elite)
        console.log(auth.user.address)
        if(listing.elite == auth.user.address){
          await listing.delete()
          // Fash success message to session
          session.flash({ notification: 'Task deleted!' })
        }
        return response.redirect('back')
      }
}

module.exports = ListingController
