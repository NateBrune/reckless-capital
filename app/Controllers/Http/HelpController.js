'use strict'
const NUM_HELP_PAGES = 6

class HelpController { 
  async index ({ view, request }) {
    const url = request.url()
    const page = url.split("/")[2]
    if(page===undefined || page>NUM_HELP_PAGES || page < 1){
      return view.render('help.introduction')
    } else {
      return view.render(`help.${page}`)
    }
  }

  async nodeInfo ({ view, request }) {
    return view.render(`help.nodeinfo`)
 
  }
}

module.exports = HelpController
