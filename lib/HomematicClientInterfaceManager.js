/*
 * File: HomematicClientInterfaceManager.js
 * Project: hm-interface
 * File Created: Thursday, 24th December 2020 7:22:50 pm
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

'use strict'

const xmlrpc = require('homematic-xmlrpc')
const binrpc = require('binrpc')
const EventEmitter = require('events')
const path = require('path')
const logger = require(path.join(__dirname, 'logger.js')).logger('Homematic Interface Manager')

class HomeMaticRPCClient {
  constructor (ifName, clientName, hostIP, hostPort, path) {
    this.port = hostPort
    this.host = hostIP
    this.ifName = ifName
    this.clientName = clientName
    this.isRunning = false

    if (this.ifName.indexOf('CUxD') > -1) {
      logger.debug('CuxD Extra ....')
      this.client = binrpc.createClient({
        host: hostIP,
        port: hostPort,
        path: path,
        queueMaxLength: 100
      })
      this.protocol = 'xmlrpc_bin://'
    } else {
      this.client = xmlrpc.createClient({
        host: hostIP,
        port: hostPort,
        path: path,
        queueMaxLength: 100
      })
      this.protocol = 'http://'
    }
  }

  init (localIP, listeningPort) {
    let self = this
    this.localIP = localIP
    this.listeningPort = listeningPort
    logger.debug('CCU RPC Init Call on %s port %s for interface %s local server port %s', this.host, this.port, this.ifName, listeningPort)
    var command = this.protocol + this.localIP + ':' + this.listeningPort
    this.ifId = this.clientName + '_' + this.ifName
    logger.debug('init parameter is %s,%s', command, this.ifId)
    this.client.methodCall('init', [command, this.ifId], (error, value) => {
      logger.debug('CCU Response for init at %s with command %s,%s ...Value (%s) Error : (%s)', self.ifName, command, self.ifId, JSON.stringify(value), error)
      self.ping()
      self.isRunning = true
    })
  }

  stop () {
    let self = this
    return new Promise((resolve, reject) => {
      logger.debug('disconnecting interface %s', self.ifName)
      try {
        self.client.methodCall('init', [self.protocol + self.localIP + ':' + self.listeningPort], (error, value) => {
          self.isRunning = false
          if ((error !== undefined) && (error !== null)) {
            logger.error('Error while disconnecting interface %s Error : %s', self.ifName, error)
            reject(error)
          } else {
            logger.debug('interface %s disconnected', self.ifName)
            resolve()
          }
        })
      } catch (e) {
        logger.error('RPC Error on %s', self.ifName)
      }
      try {
        self.server.close()
      } catch (e) {}
    })
  }

  sendRPCommand (command, parameters) {
    let self = this
    return new Promise((resolve, reject) => {
      try {
        self.client.methodCall(command, parameters, (error, value) => {
          if (error) {
            logger.error('Error while sending command %s to interface %s Error : %s', command, self.ifName, error)
            reject(error)
          } else {
          // logger.debug('interface %s returns %s', self.ifName, value)
            resolve(value)
          }
        })
      } catch (e) {
        logger.error('RPC Error on %s', self.ifName)
      }
    })
  }

  reportValueUsage (listDps) {
    let self = this
    logger.debug('Report Usage to %s', self.ifName)

    Object.keys(listDps).map((dpName) => {
      // Split into address and datapointname
      let parts = dpName.split('.')
      // part0 is the interface (we do not need this)
      let adr = parts[1]
      let dpn = parts[2]
      let cnt = listDps[dpName]
      logger.debug('Report %s time Usage of %s.%s', cnt, adr, dpn)
      self.sendRPCommand('reportValueUsage', [adr, dpn, cnt])
    })
  }

  ping () {
    this.lastMessage = Math.floor((new Date()).getTime() / 1000)
  }
}

module.exports = class HomematicClientInterfaceManager extends EventEmitter {
  constructor (options) {
    super()
    this.server = undefined
    this.client = undefined
    this.stopped = false
    this.localIP = undefined
    this.bindIP = undefined
    this.listeningPort = options.port || 7001
    this.lastMessage = 0
    this.watchDogTimer = undefined
    this.rpc = undefined
    this.rpcInit = undefined
    this.pathname = options.path || '/'
    this.clientName = options.clientName || 'node-hm-interface'
    this.resetInterfaces()
    this.watchDogTimeout = options.timeout || 300
    this.localIP = options.localIP || this.getIPAddress()
    this.bindIP = options.bindIP || this.localIP
  }

  async init () {
    this.server = await this.initServer(xmlrpc, this.listeningPort)
  }

  initServer (module, port) {
    let self = this

    logger.debug('creating rpc server on port %s', port)
    return new Promise((resolve, reject) => {
      this.isPortTaken(port, (error, inUse) => {
        if (error === null) {
          if (inUse === false) {
            self.server = module.createServer({
              host: '0.0.0.0', // listen to all
              port: port
            })

            self.server.on('NotFound', (method, params) => {
              // logger.debug("Method %s does not exist. - %s",method, JSON.stringify(params));
            })
            // we have to responde elsewhere HMIP will not talk to us
            self.server.on('listDevices', (err, params, callback) => {
              if (!err) {
                callback(null, [])
              }
            })

            self.server.on('system.listMethods', (err, params, callback) => {
            //  if (self.stopped === false) {
              let iface = self.interfaceForEventMessage(params)
              if (iface !== undefined) {
                logger.debug("Method call params for 'system.listMethods': %s (%s)", JSON.stringify(params), err)
              } else {
                logger.error('unable to find Interface for %s', params)
              }
              //  } else {
              //    logger.error('Modul is not running ignore call listMethods')
              //  }
              callback(null, ['event', 'system.listMethods', 'system.multicall'])
            })

            self.server.on('newDevices', (err, params, callback) => {
              // if (self.stopped === false) {
              let iface = self.interfaceForEventMessage(params)
              if (iface !== undefined) {
                if ((iface.isRunning === true) && (iface.reconnecting === false)) {
                  logger.debug('<- newDevices on %s. Emit this for the ccu to requery rega (%s)', iface.ifName, err)
                  self.emit('newDevices', {})
                }
              }
              // we are not intrested in new devices cause we will fetch them at launch
              // }
              callback(null, [])
            })

            self.server.on('event', (err, params, callback) => {
            //  if (self.stopped === false) {
              if (!err) {
                let iface = self.interfaceForEventMessage(params)
                if ((iface !== undefined) && (iface.isRunning === true)) {
                  iface.ping()
                  self.handleEvent(iface, 'event', params)
                } else {
                  logger.error(' event unable to find Interface for %s', params)
                }
              }
              //  }
              callback(err, [])
            })

            self.server.on('system.multicall', (err, params, callback) => {
              if (!err) {
                params.map((events) => {
                  try {
                    events.map((event) => {
                      let iface = self.interfaceForEventMessage(event.params)
                      if ((iface !== undefined) && (iface.isRunning === true)) {
                        iface.ping()
                        self.handleEvent(iface, event.methodName, event.params)
                      } else {
                        logger.error('multiCall unable to find Interface for %s', JSON.stringify(event.params))
                      }
                    })
                  } catch (err) { }
                })
              }
              callback(null)
            })

            logger.info('server for all interfaces is listening on port %s.', port)
            resolve(self.server)
          } else {
            logger.error('****************************************************************************************************************************')
            logger.error('*  Sorry the local port %s on your system is in use. Please make sure, self no other instance of this plugin is running.', port)
            logger.error('*  you may change the initial port with the config setting for local_port in your config.json ')
            logger.error('*  giving up ... the homematic plugin is not able to listen for ccu events on %s until you fix this. ')
            logger.error('****************************************************************************************************************************')
            reject(new Error('port in use error'))
          }
        } else {
          logger.error('*  Error while checking ports')
          reject(new Error('port check error'))
        }
      })
    })
  }

  interfaceForEventMessage (params) {
    var result
    if ((params) && (params.length > 0)) {
      let ifTest = params[0]
      this.interfaces.map(iface => {
        if (iface.ifId === ifTest) {
          result = iface
        }
        // this is the cuxd extra handling cause cuxd is not rega compliant and returns alwas CUxD instead of the interface identifier from the init call
        if ((ifTest === 'CUxD') && ((iface.ifName.indexOf('CUxD') > -1))) {
          result = iface
        }
      })
    }
    return result
  }

  clientFromName (ifId) {
    var result
    this.interfaces.map(iface => {
      if (iface.ifName === ifId) {
        result = iface
      }
    })
    return result
  }

  connectedInterfaces () {
    return this.interfaces
  }

  handleEvent (iface, method, params) {
    let self = this
    if ((method === 'event') && (params !== undefined)) {
      let ifName = iface.ifName
      let channel = ifName + '.' + params[1]
      let datapoint = params[2]
      let value = params[3]

      let rgx = /([a-zA-Z0-9-]{1,}).([a-zA-Z0-9-_]{1,}):([0-9]{1,}).([a-zA-Z0-9-_]{1,})/g
      let parts = rgx.exec(channel + '.' + datapoint)
      if ((parts) && (parts.length > 4)) {
        let idx = parts[1]
        let address = parts[2]
        let chidx = parts[3]
        let evadr = idx + '.' + address + ':' + chidx + '.' + datapoint
        logger.debug('event for %s.%s with value %s', channel, datapoint, value)
        self.emit('event', {address: evadr, value: value, intfid: idx, channel: address + ':' + chidx, datapoint: datapoint})
      }
    }
  }

  addInterface (ifName, hostIP, hostPort, path) {
    // PowerUP rpc bin if needed
    if ((ifName.indexOf('CUxD') > -1) && (!(this.binServer))) {
      logger.debug('open extra Connector for CuxD')
      this.binServer = this.initServer(binrpc, this.listeningPort + 1)
      logger.debug('Connector for CuxD is done')
    }

    logger.debug('adding Interface %s Host %s Port %s Path %s', ifName, hostIP, hostPort, path)
    let client = new HomeMaticRPCClient(ifName, this.clientName, hostIP, hostPort, path)
    this.interfaces.push(client)
  }

  connect () {
    let self = this
    logger.debug('Connecting all interfaces (%s interfaces found)', this.interfaces.length)
    this.interfaces.map(iface => {
      let port = self.listeningPort
      if (iface.ifName.indexOf('CUxD') > -1) {
        port = port + 1
      }
      logger.debug('init interface %s for connection to port %s', iface.ifName, port)
      iface.init(self.bindIP, port)
      iface.serverPort = port
    })

    if (this.watchDogTimeout > 0) {
      logger.debug('init watchdog %s seconds', this.watchDogTimeout)
      this.ccuWatchDog()
    }
    this.stopping = false
  }

  ccuWatchDog () {
    var self = this
    this.interfaces.map(async (iface) => {
      if (iface.lastMessage !== undefined) {
        var now = Math.floor((new Date()).getTime() / 1000)
        var timeDiff = now - iface.lastMessage
        if (timeDiff > self.watchDogTimeout) {
          logger.debug('Watchdog Trigger - Reinit Connection for %s after idle time of %s seconds', iface.ifName, timeDiff)
          self.lastMessage = now
          iface.reconnecting = true
          try {
            await iface.stop()
            iface.init(self.bindIP, iface.serverPort)
          } catch (e) {
            logger.error('error while watchdog reconnecting')
          }
          setTimeout(() => { iface.reconnecting = false }, 2000)
        }
      }
    })

    var recall = () => {
      self.ccuWatchDog()
    }

    this.watchDogTimer = setTimeout(recall, 10000)
  }

  disconnectInterfaces () {
    let self = this
    if (this.stopped) {
      return
    }
    clearTimeout(this.watchDogTimeout)
    this.stopped = true
    return Promise.all(self.interfaces.map(async (iface) => {
      try {
        await iface.stop()
      } catch (e) {
        // we are disconnecting .. 's tät wurschd sein
      }
    })
    )
  }

  sendInterfaceCommand (ifId, command, parameters) {
    let self = this
    logger.debug('sendInterfaceCommand %s %s', ifId, command)
    return new Promise((resolve, reject) => {
      let hmRpcClient = self.clientFromName(ifId + '.')
      if (hmRpcClient) {
        logger.debug('interface found going ahead')
        hmRpcClient.sendRPCommand(command, parameters).then(result => {
          resolve(result)
        }).catch(error => reject(error))
      } else {
        logger.debug('interface %s NOT found ', ifId)
      }
    })
  }

  resetInterfaces () {
    logger.debug('reseting all interface connections')
    this.interfaces = []
    this.stopped = false
  }

  stop () {
    let self = this
    return new Promise(async (resolve, reject) => {
      await self.disconnectInterfaces()

      logger.debug('closing eventserver')
      if (self.server) {
        self.server.close(() => {
          logger.debug('eventserver removed')
          resolve()
        })
      } else {
        resolve()
      }
      if (self.binServer) {
        self.binServer.close()
      }
    })
  }

  getIPAddress () {
    const os = require('os')
    var interfaces = os.networkInterfaces()

    for (var devName in interfaces) {
      var iface = interfaces[devName]
      for (var i = 0; i < iface.length; i++) {
        var alias = iface[i]

        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal && (alias.address.indexOf('169.254.') === -1)) {
          return alias.address
        }
      }
    }
    return '0.0.0.0'
  }

  // checks if the port is in use
  // https://gist.github.com/timoxley/1689041

  isPortTaken (port, fn) {
    var net = require('net')
    var tester = net.createServer().once('error', (err) => {
      if (err.code !== 'EADDRINUSE') return fn(err)
      fn(null, true)
    })
      .once('listening', () => {
        tester.once('close', () => {
          fn(null, false)
        })
          .close()
      }).listen(port)
  }
}
