/*
 * File: RPCClient.js
 * Project: hm-interface
 * File Created: Monday, 21st December 2020 6:58:32 pm
 * Author: Thomas Kluge (th.kluge@me.com)
 * -----
 * The MIT License (MIT)
 *
 * Copyright (c) Thomas Kluge <th.kluge@me.com> (https://github.com/thkl)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * ==========================================================================
 */

const path = require('path')
const xmlrpc = require('homematic-xmlrpc')
const logger = require(path.join(__dirname, 'logger.js')).logger('RPCClient')
const Url = require('url')

module.exports = class RPCClient {
  constructor () {
    this.multicallPayload = []
  }

  methodCall (method, params, callback) {
    let self = this
    if (this.errorCount < 10) {
      logger.debug('RPC Out -> method:%s | params:%s', method, JSON.stringify(params))
      try {
        this.client.methodCall(method, params, (error, value) => {
          if (error) {
            self.errorCount = parseInt(self.errorCount) + 1
            logger.error('Error while sending message %s:%s (%s) %s-%s', self.hostname, self.port, self.errorCount, method, JSON.stringify(params))
          } else {
            self.errorCount = 0
          }
          callback(error, value)
        })
      } catch (e) {
        logger.error('RPC Error on %s:%s Message was %s %s', self.hostname, self.port, method, JSON.stringify(params))
        callback(null, null)
      }
    } else {
      logger.warn('Discarding Message Consumer will be removed soon')
      let msg = 'error'
      callback(msg, null)
    }
  }

  encode () {
    return {
      'hostname': this.hostname,
      'port': this.port,
      'path': this.path,
      'callbackid': this.callbackid
    }
  }

  init (ccuip, urlstring, callbackid) {
    logger.info('Init RPC with saved callback at %s', urlstring)
    var purl = new Url.URL(urlstring)
    this.port = (purl.port != null) ? purl.port : 80
    this.path = purl.pathname
    this.callbackid = callbackid
    this.errorCount = 0
    this.hostname = purl.hostname

    // FW > 3.41
    if (this.port > 30000) {
      this.port = this.port - 30000
    }
    switch (purl.hostname) {
      case '127.0.0.1':

        if (purl.protocol === 'protocol') {
          purl.protocol = 'http'
        }

        this.hostname = ccuip
        break

      case undefined:
        this.hostname = ccuip
        break

      default:
        this.hostname = purl.hostname
    }

    logger.info('init with host %s at port %s path %s', JSON.stringify(this.hostname), this.port, this.path)

    this.client = xmlrpc.createClient({
      host: this.hostname,
      port: this.port,
      path: this.path
    })
  }

  initFromPersistentObject (encodedobject, ccuip) {
    this.port = encodedobject.port
    this.path = encodedobject.path
    this.callbackid = encodedobject.callbackid
    this.errorCount = 0
    if (encodedobject.hostname === undefined) {
      encodedobject.hostname = '127.0.0.1'
    }

    if (encodedobject.hostname === '127.0.0.1') {
      this.hostname = ccuip
    } else {
      this.hostname = encodedobject.hostname
    }

    logger.info('init stored client with host %s at port %s path %s', this.hostname, this.port, this.path)
    this.client = xmlrpc.createClient({
      host: this.hostname,
      port: this.port,
      path: this.path
    })
  }

  description () {
    return this.hostname + ':' + this.port + this.path
  }

  isEqual (rpcconsumer) {
    var result = true
    if (this.port !== rpcconsumer.port) {
      result = false
    }

    if (this.hostname !== rpcconsumer.hostname) {
      result = false
    }

    if (this.path !== rpcconsumer.path) {
      result = false
    }
    return result
  }
}
