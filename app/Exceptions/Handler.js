'use strict'

const BaseExceptionHandler = use('BaseExceptionHandler')
const Logger = use('Logger')

/**
 * This class handles all exceptions thrown during
 * the HTTP request lifecycle.
 *
 * @class ExceptionHandler
 */
class ExceptionHandler extends BaseExceptionHandler {
  /**
   * Handle exception thrown during the HTTP lifecycle
   *
   * @method handle
   *
   * @param  {Object} error
   * @param  {Object} options.request
   * @param  {Object} options.response
   *
   * @return {void}
   */
  async handle (error, { request, response }) {
    //TODO: Render error page
    response.status(error.status).send('<html><body bgcolor="#000"><br><br><center><p style="font-family:Times New Roman; font-size:69; color: red;">Server Error</p><p style="font-family:Times New Roman; font-size:24; color: white;">' + error + '</p></center></body>')
  }

  /**
   * Report exception for logging or debugging.
   *
   * @method report
   *
   * @param  {Object} error
   * @param  {Object} options.request
   *
   * @return {void}
   */
  async report (error, { request }) {
    Logger.notice("Server Error: %s", error)

  }
}

module.exports = ExceptionHandler
