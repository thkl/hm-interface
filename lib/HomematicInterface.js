/*
 * File: HomematicInterface.js
 * Project: hm-interface
 * File Created: Monday, 21st December 2020 6:57:12 pm
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

const EventEmitter = require('events')
const path = require('path')
const os = require('os')
const fs = require('fs')
const HomematicDevice = require(path.join(__dirname, 'HomematicDevice.js'))
const RPCClient = require(path.join(__dirname, 'RPCClient.js'))
const logger = require(path.join(__dirname, 'logger.js')).logger('Homematic Interface')
const xmlrpc = require('homematic-xmlrpc')
const Url = require('url')

module.exports = class HomematicInterface extends EventEmitter {
  constructor (config) {
    super()
    this.config = config || {}
    this.ccuIP = this.config.ccuIP || '127.0.0.1'
    this.clients = []
    this.devices = []
    this.isCollectingMulticalls = false
    this.interfaceName = config.name || 'HVL'
    let pck = require(path.join(__dirname, '..', 'package.json'))
    this.version = pck.version
  }

  init () {
    let self = this

    return new Promise(async (resolve, reject) => {
      self.maxRPCTimeOut = (self.config.maxRpcMessageTimeout || 5) * 60000
      let unknowInstanceMessage = {
        'faultCode': -2,
        'faultString': 'Unknown instance'
      }
      let localPort = self.config.localPort || 7000
      let localIp = self.config.localIp || '0.0.0.0'
      let serverOptions = (self.config.bindAll === undefined) ? {
        host: localIp,
        port: localPort
      } : {
        port: localPort
      }

      try {
        logger.info('Creating Server with %s', JSON.stringify(serverOptions))

        self.rpcServer = await xmlrpc.createServer(serverOptions)
        logger.debug('RPC is up')
        resolve()
      } catch (e) {
        logger.error('Can\'t start rpc')
      }

      self.rpcServer.on('NotFound', (method, params) => {
        logger.debug('Method %s does not exist. - %s', method, JSON.stringify(params))
      })

      logger.info('XML-RPC server for interface HomematicInterface is listening on %s:%s', (serverOptions.host) ? serverOptions.host : '0.0.0.0', serverOptions.port)
      logger.info('CCU RPC message timeout set to %s ms', self.maxRPCTimeOut)

      let methods = {
        'system.listMethods': function listMethods (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < system.listMethods (%s)', params)
            logger.debug('repl  > %s', JSON.stringify(Object.keys(methods)))
            callback(null, Object.keys(methods))
          }
        },

        'listDevices': function listDevices (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < listDevices %s', params)
            let devices = self.getMyDevices()
            callback(null, devices)
          }
        },

        'getDeviceDescription': function getDeviceDescription (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < getDeviceDescription %s %s', err, params)
            let adress = params[0]
            let isDeviceAdress = (adress.indexOf(':') === -1)
            let device = self.deviceWithAdress(adress)

            if ((!device) && (isDeviceAdress)) {
              if (!device) {
                logger.debug('Device not found %s', adress)
              }
              // self.autoDeleteDevice(adress)
            }

            if (device) {
              let re = device.getDeviceDescription()
              logger.debug('repl  > %s', JSON.stringify(re))
              callback(null, re)
            } else {
              let channel = self.channelWithAdress(adress)
              if (channel) {
                let re = channel.getChannelDescription()
                logger.debug('repl  > %s', JSON.stringify(re))
                callback(null, re)
              } else {
                logger.debug('repl > getDeviceDescription %s', 'Nothing Found')
                callback(unknowInstanceMessage, undefined)
              }
            }
          }
        },

        'getLinks': function getLinks (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < getLinks %s', params)
            logger.debug('repl  > %s', [])
            callback(null, [])
          }
        },

        'listBidcosInterfaces': function (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < listBidcosInterfaces %s', params)
            let result = [{NAME: 'Dummy', CONNECTED: true, DEFAULT: true, DESCRIPTION: '', DUTY_CYCLE: 6, FIRMWARE: self.version, TYPE: 'CCU2'}]
            logger.debug('repl  > %s', JSON.stringify(result))
            callback(null, result)
          }
        },

        'getValue': function getValue (err, params, callback) {
          if (!err) {
            let found = false
            self.lastMessage = new Date()
            logger.debug('rpc < getValue %s', params)
            let adress = params[0]
            let parameterName = params[1]
            self.devices.forEach(function (device) {
              device.channels.forEach(function (channel) {
                if (channel.adress === adress) {
                  let re = channel.getParamsetValue('VALUES', parameterName)
                  logger.debug('repl  > %s', JSON.stringify(re))
                  found = true
                  callback(null, re)
                }
              })
            })
            if (!found) {
              callback(unknowInstanceMessage, undefined)
            }
          }
        },

        'setValue': function setValue (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < setValue %s', params)
            let adress = params[0]
            let parameterName = params[1]
            let value = params[2]
            self.devices.map((device) => {
              device.channels.map((channel) => {
                if (channel.adress === adress) {
                  channel.setValue(parameterName, value)
                }
              })
            })
            logger.debug('repl  > %s %s', null, null)
            callback(null, undefined)
          }
        },

        'getParamsetDescription': function getParamsetDescription (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < getParamsetDescription %s', params)
            let adress = params[0]
            let paramset = params[1]
            let found = false
            self.devices.forEach(function (device) {
              if (device.adress === adress) {
                let re = device.getParamsetDescription(paramset)
                logger.debug('repl  > %s', JSON.stringify(re))
                callback(null, re)
                found = true
                return
              }

              device.channels.forEach(function (channel) {
                if (channel.adress === adress) {
                  let re = channel.getParamsetDescription(paramset)
                  logger.debug('repl  > %s', JSON.stringify(re))
                  callback(null, re)
                  found = true
                }
              })
            })

            if (found === false) {
              logger.debug('repl > getParamsetDescription', 'Nothing Found')
              callback(unknowInstanceMessage, undefined)
            }
          }
        },

        'getParamsetId': function getParamsetId (err, params, callback) {
          if (!err) {
            let found = false
            self.lastMessage = new Date()
            logger.debug('rpc < getParamsetId %s', params)
            let adress = params[0]
            let paramset = params[1]
            self.devices.forEach(function (device) {
              if (device.adress === adress) {
                let re = device.getParamsetId(paramset)
                logger.debug('repl  > %s', JSON.stringify(re))
                found = true
                callback(null, re)
                return
              }

              device.channels.forEach(function (channel) {
                if (channel.adress === adress) {
                  let re = channel.getParamsetId(paramset)
                  logger.debug('repl  > %s', JSON.stringify(re))
                  found = true
                  callback(null, re)
                }
              })
            })
            if (!found) {
              callback(unknowInstanceMessage, undefined)
            }
          }
        },

        'getParamset': function getParamset (err, params, callback) {
          if (!err) {
            let found = false
            self.lastMessage = new Date()
            logger.debug('rpc < getParamset %s', params)
            let adress = params[0]
            let paramset = params[1]
            self.devices.forEach(function (device) {
              if (device.adress === adress) {
                let re = device.getParamset(paramset)
                logger.debug('repl dpset > %s', JSON.stringify(re))
                found = true
                callback(null, re)
                return
              }

              device.channels.forEach(function (channel) {
                if (channel.adress === adress) {
                  logger.debug('fetch pset %s from channel %s', paramset, adress)
                  let re = channel.getParamset(paramset)
                  logger.debug('repl cpset > %s', JSON.stringify(re))
                  found = true
                  callback(null, re)
                }
              })
            })
            if (!found) {
              callback(unknowInstanceMessage, null)
            }
          }
        },

        'reportValueUsage': function reportValueUsage (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < reportValueUsage %s', params)
            // thank you for the fish ...
            callback(null, [])
          }
        },

        'deleteDevice': function deleteDevice (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < deleteDevice %s', params)
            let adress = params[0]
            logger.debug('repl  >', [])
            callback(null, [])

            // call Bridge and set Flag
            let device = self.deviceWithAdress(adress)
            if (device !== undefined) {
              self.deleteDevice(device, false)
            }
            // rega callback
            self.sendRPCMessage(undefined, 'deleteDevices', [adress], function (error, value) {
              if (error) {
                logger.error('RegaError %s', error)
              }
            })
          }
        },

        'getLinkPeers': function getLinkPeers (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < getLinkPeers %s', params)
            // var adress = params[0]
            // var mode = params[1]
            logger.debug('repl  >', null)
            callback(null, [])
          }
        },

        'system.methodHelp': function methodHelp (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < methodHelp %s %s', err, params)
            logger.debug('repl  >', null)
            callback(null, [])
          }
        },

        'putParamset': function putParamset (err, params, callback) {
          if (!err) {
            let found = false
            self.lastMessage = new Date()
            logger.debug('rpc < putParamset %s', params)
            let adress = params[0]
            let paramset = params[1]
            let parameters = params[2]
            self.devices.forEach(function (device) {
              if (device.adress === adress) {
                let re = device.putParamset(paramset, parameters)
                logger.debug('repl  >', null, JSON.stringify(re))
                device.resetConfigPending()
                self.saveDevice(device)
                found = true
                callback(null, re)
                return
              }

              device.channels.forEach(function (channel) {
                if (channel.adress === adress) {
                  let re = channel.putParamset(paramset, parameters)
                  logger.debug('repl  > %s', JSON.stringify(re))
                  device.resetConfigPending()
                  self.saveDevice(device)
                  found = true
                  callback(null, re)
                }
              })
            })
            if (!found) {
              callback(unknowInstanceMessage, undefined)
            }
          }
        },

        'init': function init (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < init %s', params)
            let url = params[0]
            let intf = params[1]

            let cns = new RPCClient()

            if ((intf !== undefined) && (intf !== '')) {
              logger.debug('initwithurl %s', url)
              url = self.fixCCUInitCall(url)
              logger.debug('initwith fixed url %s', url)

              cns.init(self.ccuIP, url, params[1])
              self.addClient(cns)
              self.saveClients()

              logger.info('connection request at %s with callback %s .. live is good', url, params[1])
              logger.info('%s dude(s) to publish events', self.clients.length)

              callback(null, [])
            } else {
              let purl = new Url.URL(url)
              cns = self.clientWithHost(purl.hostnamem, purl.port)
              if (cns !== undefined) {
                self.removeClient(cns)
                self.saveClients()
                logger.info('there is a removal for %s', purl.hostname)
                logger.info('%s dude(s) to publish events', self.clients.length)
              }
              callback(null, [])
            }
          }
        },

        'ping': function ping (err, params, callback) {
          if (!err) {
            self.lastMessage = new Date()
            logger.debug('rpc < ping %s', params)
            logger.debug('repl  > %s', 'pong to all consumers')
            self.pong(params)
            callback(null, 1)
          }
        }

      }

      Object.keys(methods).forEach(function (m) {
        self.rpcServer.on(m, methods[m])
      })

      self.rpcServer.close = function () {
        logger.info('RPC Server was removed.')
      }
    })
  }

  fixCCUInitCall (url) {
    let self = this
    let oReplacements = []

    oReplacements.push({
      'xmlrpc_bin://127.0.0.1:31999': 'http://$ccuip$:1999'
    })
    oReplacements.push({
      'xmlrpc_bin://127.0.0.1:1999': 'http://$ccuip$:1999'
    })
    oReplacements.push({
      'http://127.0.0.1:39292/bidcos': 'http://$ccuip$:9292/bidcos'
    })

    oReplacements.forEach((oReplacement) => {
      Object.keys(oReplacement).forEach((rUrl) => {
        if (url === rUrl) {
          url = oReplacement[rUrl]
          logger.debug('will change to %s', url)
        }
      })
    })
    url = url.replace('$ccuip$', self.ccuIP)
    logger.debug('fixCCUInitCall will return %s', url)
    return url
  }

  pong (params) {
    if (params !== undefined) {
      this.clients.forEach((tc) => {
        let cid = tc.callbackid
        let eventPayload = []
        eventPayload.push({
          'methodName': 'event',
          'params': [cid, 'PONG', params[0]]
        })
        tc.methodCall('system.multicall', [eventPayload], function (error, value) {
          if (error) {
            logger.error('system call error %s', error)
          }
        })
      })
    }
  }

  getMyDevices () {
    let result = []
    this.devices.some((device) => {
    // Check if there is a deletion flag
      // if (!self.wasDeletedBefore(device)) {
      if (device.hidden === false) {
        result.push(device.getDeviceDescription())
        device.channels.forEach((channel) => {
          result.push(channel.getChannelDescription())
        })
      }
      // }
    })
    return result
  }

  publishAllDevices () {
    let self = this
    return new Promise((resolve, reject) => {
      self.sendRPCMessage(undefined, 'newDevices', self.getMyDevices(), function (error, value) {
        if (!error) {
          self.devices.forEach(function (device) {
            if (device.hidden === false) {
              device.wasPublished = true
              self.saveDevice(device)
            }
          })
          resolve()
        } else {
          reject(error)
        }
      })
    })
  }

  addClient (aClient) {
    logger.debug('Adding new Client')
    this.clients = this.removeOldClient(aClient)
    this.clients.push(aClient)
  }

  saveClients () {
    // Encode
    let encoded = []
    this.clients.map((client) => {
      encoded.push(client.encode())
    })
    let fpath = this.config.persistentPath || fs.realpathSync(os.tmpdir())
    fs.writeFileSync(path.join(fpath, 'hmi.tmp'), JSON.stringify(encoded, ' ', 2))
  }

  clientWithID (cid) {
    let rslt = this.clients.filter((aClient) => { return (aClient.callbackid === cid) })
    if (rslt.length > 0) {
      return rslt[0]
    } else {
      return null
    }
  }

  clientWithHost (hostname, port) {
    let rslt = this.clients.filter((aClient) => { return ((aClient.hostname === hostname) && (aClient.port === port)) })
    if (rslt.length > 0) {
      return rslt[0]
    } else {
      return null
    }
  }

  cleanUp () {
    this.clients = []
    this.saveClients()
    this.lastMessage = ''
  }

  removeOldClient (newClient) {
    let result = this.clients.filter((ctt) => {
      return !ctt.isEqual(newClient)
    })
    logger.debug('Remove old client %s', JSON.stringify(this.clients))
    return result
  }

  removeClient (aClient) {
    let index = this.clients.indexOf(aClient)
    if (index > -1) {
      this.clients.splice(index, 1)
    }
    logger.debug('remove client %s', JSON.stringify(this.clients))
  }

  loadClients (ccuip) {
    let self = this
    this.clients = []
    var myccuip = ccuip
    let fpath = this.config.persistentPath || fs.realpathSync(os.tmpdir())
    let fFile = path.join(fpath, 'hmi.tmp')
    if (fs.existsSync(fFile)) {
      let savedClients = JSON.parse(fs.readFileSync(fFile))
      if (savedClients) {
        savedClients.map((obj) => {
          logger.info('init client %s', JSON.stringify(obj))
          var cns = new RPCClient()
          cns.initFromPersistentObject(obj, myccuip)
          self.addClient(cns)
        })
      }
    }
  }

  initDevice (ownerName, serial, type, deviceData, extSerial) {
    var device = new HomematicDevice(ownerName, this.interfaceName)
    // first check if we have stored data
    if (extSerial === undefined) {
      extSerial = serial
    }
    var data = this.deviceDataWithSerial(extSerial)
    if (data !== undefined) {
    // if there is a persistent file with data create the device from that data
      device.initWithStoredData(data)
    }

    if (device.initialized === false) {
    // if not build a new device from template
      device.initWithType(type, serial, deviceData)
      device.serialNumber = extSerial
      this.addDevice(device, true)
    } else {
    // device was initalized from persistent data just add it to the interface
      this.addDevice(device, false)
    }

    return device
  }

  deviceWithSerial (serialNumber) {
    return this.devices.filter((device) => {
      return (device.serialNumber === serialNumber)
    }).pop()
  }

  deviceDataWithSerial (serial) {
    let fpath = this.config.persistentPath || fs.realpathSync(os.tmpdir())
    let persistenceFile = path.join(fpath, serial + '.dev')
    try {
      let data = fs.readFileSync(persistenceFile)
      // Try to parse //
      JSON.parse(data)
      return data
    } catch (e) {
      return undefined
    }
  }

  deviceWithAdress (adress) {
    return this.devices.filter((device) => {
      return (device.adress === adress)
    }).pop()
  }

  channelWithAdress (adress) {
    var deviceAdress = adress.slice(0, adress.indexOf(':'))
    var selectedDevice = this.devices.filter((device) => {
      return device.adress === deviceAdress
    }).pop()

    if (selectedDevice) {
      var selChannel = selectedDevice.channels.filter(function (channel) {
        return channel.adress === adress
      }).pop()
      return selChannel
    }
    return undefined
  }

  addDevice (device, save, hidden) {
    let self = this
    logger.debug('Add new Device to HomeMatic Interface %s', device.adress)
    device.hidden = hidden || false
    device.interfaceName = this.ccuInterfaceName || 'HVL'
    logger.debug('List contains %s items', this.devices.length)
    this.devices.push(device)
    logger.debug('Pushed to list %s', device.hidden)
    logger.debug('List contains %s items', this.devices.length)

    if (!hidden) {
    // Add Listener to Working Events to publish
      device.on('event_device_channel_value_change', (parameter) => {
        logger.debug('Device Value Change Event for %s', parameter.channel)
        self.sendRPCEvent(parameter.channel, parameter.parameters)
        self.emit('event_device_channel_value_change', parameter)
      })

      device.on('device_channel_value_change', (parameter) => {
        self.emit('device_channel_value_change', parameter)
      })
    }

    if ((!device.wasPublished) && (!device.hidden)) {
      logger.debug('Send this to CCU')
      var result = []
      result.push(device.getDeviceDescription())

      device.channels.forEach(function (channel) {
        result.push(channel.getChannelDescription())
      })

      this.sendRPCMessage(undefined, 'newDevices', result, (error, value) => {
        if (!error) {
          device.wasPublished = true
          if (save) {
            self.saveDevice(device)
          }
        }
      })
    } else {
      logger.debug('CCU should know about %s', device.adress)
      if (save) {
        this.saveDevice(device)
      }
    }
  }

  markDeletedDevice (serial) {
    let fl = path.join(this.config.persistentPath, 'deletedDevices.json')
    let ddList = []
    try {
      if (fs.existsSync(fl)) {
        ddList = JSON.parse(fs.readFileSync(fl))
      }
    } catch (e) {

    }
    ddList.push(serial)
    fs.writeFileSync(fl, JSON.stringify(ddList))
  }

  deleteDevice (device, publish) {
    logger.debug('Remove Device from HM_Interface %s', device.adress)
    var index = this.devices.indexOf(device)
    if (index > -1) {
      this.devices.splice(index, 1)
      // Remove persistence
      var persistenceFile = this.config.persistentPath + '/' + device.serialNumber + '.dev'
      try {
        if (fs.existsSync(persistenceFile)) {
          fs.unlinkSync(persistenceFile)
        }
        this.markDeletedDevice(device.adress)
      } catch (err) {
        logger.error('delete device error %s', err)
      }
      // Send that to all consumers
      if (publish === true) {
        this.sendRPCMessage(undefined, 'deleteDevices', [device.adress], function (error, value) {
          if (error) {
            logger.error(error)
          }
        })
      }
    }
  }

  deleteDevicesByOwner (deviceOwner) {
    var that = this
    logger.debug('deleteDevicesByOwner %s', deviceOwner)
    this.devices.some(function (device) {
      if ((device.owner) && (device.owner === deviceOwner)) {
        that.deleteDeviceTemporary(device)
      }
    })
  }

  deleteDeviceWithAdress (adress) {
    logger.debug('Remove Device Rega %s', adress)
    this.sendRPCMessage(undefined, 'deleteDevices', [adress], function (error, value) {
      if (error) {
        logger.error(error)
      }
    })
  }

  deleteDeviceTemporary (device) {
    logger.debug('temporary Remove Device from HM_Interface %s', device.adress)
    var index = this.devices.indexOf(device)
    if (index > -1) {
      this.devices.splice(index, 1)
    }
  }

  saveDevice (device) {
    let fpath = this.config.persistentPath || fs.realpathSync(os.tmpdir())
    let persistenceFile = path.join(fpath, device.serialNumber + '.dev')
    logger.debug('make device %s persistent at %s', device.serialNumber, persistenceFile)
    fs.writeFileSync(persistenceFile, device.savePersistent())
  }

  sendRPCMessage (clientID, method, payload, callback) {
    if (clientID === undefined) {
    // send to all
      logger.debug('Will send %s with payload %s to all Clients', method, JSON.stringify(payload))
      this.clients.forEach(function (aClient) {
        if (aClient.path !== '/bidcos') {
          aClient.methodCall(method, [aClient.callbackid, payload], function (error, value) {
            logger.debug('RPC %s Response %s Errors: %s', method, JSON.stringify(payload), error)
            if (callback !== undefined) {
              callback(error, value)
            }
          })
        } else {
          logger.info('Skip HMServer')
        }
      })
    } else {
      let client = this.clientWithID(clientID)
      if (client !== undefined) {
        client.methodCall(method, [clientID, payload], function (error, value) {
          logger.debug('RPC %s Response %s Errors: %s', method, JSON.stringify(payload), error)
          if (callback !== undefined) {
            callback(error, value)
          }
        })
      }
    }
  }

  startMulticallEvent (timeout) {
    let self = this
    if (this.isCollectingMulticalls === false) {
      this.isCollectingMulticalls = true

      if (timeout > 0) {
        setTimeout(() => {
        // If still collecting .. send pending events
          if (this.isCollectingMulticalls === true) {
            logger.debug('Timeout send all events')
            self.sendMulticallEvents()
          }
        }, timeout)
      }
    }
  }

  sendMulticallEvents () {
    let self = this
    logger.debug('sending all saved events')
    this.clients.forEach(function (tc) {
      if (tc.multicallPayload.length > 0) {
        logger.debug('Queuesize for %s is %s', tc.callbackid, tc.multicallPayload.length)
        try {
          tc.methodCall('system.multicall', [tc.multicallPayload], (error, value) => {
            tc.multicallPayload = [] // clean
            if ((error) && (tc.errorCount >= 10)) {
              logger.info('Will remove Client %s cause of no responding', tc.hostname)
              self.removeClient(tc)
              self.saveClients()
            }
          })
        } catch (e) {
          logger.error('RPC Multicall Error')
        }
      } else {
        logger.debug('Skipping %s empty queue (%s)', tc.callbackid, tc.multicallPayload.length)
      }
    })
    self.isCollectingMulticalls = false
  }

  sendRPCEvent (adress, parameters) {
    var self = this
    this.clients.forEach(function (tc) {
    // var eventPayload = []
      var cid = tc.callbackid
      parameters.forEach((parameter) => {
        var pValue = parameter.value
        /*
        if (parameter.type === 'FLOAT') {
          pValue = {
            'explicitDouble': parameter.value
          }
        } else {
          pValue = parameter.value
        }
  */
        if (self.isCollectingMulticalls === false) {
          try {
            tc.methodCall('event', [cid, adress, parameter.name, pValue], (error, value) => {
              if ((error) && (tc.errorCount >= 10)) {
                logger.info('Will remove Client %s cause of no responding', tc.hostname)
                self.removeClient(tc)
                self.saveClients()
              }
            })
          } catch (e) {
            logger.error('RPC Event Error')
          }
        } else {
        // make sure we have the payload array
          if (tc.multicallPayload === undefined) {
            tc.multicallPayload = []
          }
          logger.debug('Saving event for a multicall later')
          tc.multicallPayload.push({
            'methodName': 'event',
            'params': [cid, adress, parameter.name, pValue]
          })
        }
      })
    })
  }

  listClients () {
    return this.clients
  }
}
