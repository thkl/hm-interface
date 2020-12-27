/*
 * File: HomematicDevice.js
 * Project: hm-interface
 * File Created: Monday, 21st November 2016 6:41:39 am
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
const path = require('path')
const HomematicParameterSet = require(path.join(__dirname, '/HomematicParameterSet.js'))
const HomematicParameter = require(path.join(__dirname, '/HomematicParameter.js'))
const HomematicChannel = require(path.join(__dirname, '/HomematicChannel.js'))
const logger = require(path.join(__dirname, '/logger.js')).logger('Homematic Device')
const EventEmitter = require('events')

module.exports = class HomematicDevice extends EventEmitter {
  constructor (owner, interfaceName) {
    super()
    this.initialized = false
    this.channels = []
    this.paramsets = []
    this.hiddden = false
    this.owner = owner
    this.interfaceName = interfaceName
  }

  initWithType (deviceType, adress, deviceData) {
    logger.debug('Init With Type (%s)', deviceType)
    adress = adress.replace(/[ ]/g, '_')
    adress = adress.replace(/[:]/g, '')
    var self = this
    this.version = 1
    this.firmware = '1.0'
    this.serialNumber = adress
    this.deviceType = deviceType

    if (deviceData) {
      logger.debug('Device data seems to be valid')
      this.type = deviceData.type
      this.adress = adress
      if (deviceData.channels) {
        deviceData.channels.forEach(function (channel) {
          var cadress = channel.adress
          // check this channel definition is valid for multiple adresses
          if (Array.isArray(cadress)) {
          // map each one to the same channeltype
            cadress.forEach(function (adr) {
              logger.debug('This is a multi def channel:')
              logger.debug('Address %s, Type %s', adr, self.type)
              logger.debug('Definitions : Channel Type %s Channel Flags  %s Direction %s', channel.type, channel.flags, channel.direction)
              logger.debug('Paramsets %s', JSON.stringify(channel.paramsets))
              logger.debug('Version %s', channel.version)

              let hmChannel = new HomematicChannel(adress, self.type, adr,
                channel.type, channel.flags,
                channel.direction, channel.paramsets,
                channel.version)
              self.addChannel(hmChannel)
            })
          } else {
            logger.debug('This is a single def channel:')
            logger.debug('Address %s, Type %s', cadress, self.type)
            logger.debug('Definitions : Channel Type %s Channel Flags  %s Direction %s', channel.type, channel.flags, channel.direction)
            logger.debug('Paramsets %s', JSON.stringify(channel.paramsets))
            logger.debug('Version %s', channel.version)
            // single one ... normal init
            let hmChannel = new HomematicChannel(adress, self.type, cadress,
              channel.type, channel.flags,
              channel.direction, channel.paramsets,
              channel.version)
            self.addChannel(hmChannel)
          }
        })
      }
      logger.debug('Channels completed')
      var mps = deviceData.paramsets
      mps.forEach(function (pSet) {
        var ps = new HomematicParameterSet(pSet.name, pSet.id)
        var parameter = pSet.parameter
        if (parameter !== undefined) {
          parameter.forEach(function (jParameter) {
            var p = new HomematicParameter(jParameter)
            ps.addParameter(p)
          })
        }

        self.paramsets.push(ps)
      })
      logger.debug('Parameter completed')

      this.version = deviceData.version

      // set LOWBAT to false
      var mt = this.getChannelWithTypeAndIndex('MAINTENANCE', 0)
      if (mt) {
        logger.debug('Setting CONFIG_PENDING STICKY_UNREACH UNREACH to false')
        mt.updateValue('CONFIG_PENDING', false, false, false)
        mt.updateValue('STICKY_UNREACH', false, false, false)
        mt.updateValue('UNREACH', false, false, false)
      }

      this.initialized = true
      logger.debug('Device Init completed')
    }
  }

  initWithStoredData (storedData) {
    var jStoredData
    if (storedData === undefined) {
      logger.warn('Stored Data is null')
    } else {
      jStoredData = JSON.parse(storedData)
    }
    logger.debug('Init with stored data')
    var serial = jStoredData.serialNumber
    var published = jStoredData.wasPublished
    var adress = jStoredData.adress
    var firmware = jStoredData.firmware
    var paramsets = jStoredData.paramsets
    var type = jStoredData.type
    var version = jStoredData.version
    var self = this

    adress = adress.replace(/[ ]/g, '_')
    adress = adress.replace(/[:]/g, '')
    if (serial) {
      serial = serial.replace(/[ ]/g, '_')
      serial = serial.replace(/[:]/g, '_')
      this.serialNumber = serial
    } else {
      logger.error('Serial is empty for %s', adress)
    }

    if (type !== undefined) {
      this.type = type
    }
    if (adress !== undefined) {
      this.adress = adress
    }
    if (firmware !== undefined) {
      this.firmware = firmware
    }
    if (version !== undefined) {
      this.version = version
    }
    if (published !== undefined) {
      this.wasPublished = published
    }

    let jChannels = jStoredData.channels

    if ((serial === undefined) || (adress === undefined) || (jChannels === undefined)) {
      logger.debug('Cannot init device from storedData %s %s %s . Do not panic. There will be a shiny new one is just a second.', serial, adress, jChannels)
      return false
    }

    if (jChannels !== undefined) {
      jChannels.forEach(function (channel) {
      // var cadress = channel['adress']
        let cidx = channel._index || channel.index
        logger.debug('Add Channel %s', cidx)
        let hmChannel = new HomematicChannel(adress, type, cidx,
          channel.type, channel.flags,
          channel.direction, channel.paramsets,
          channel.version)
        self.addChannel(hmChannel)
      })
    }

    if (paramsets !== undefined) {
      paramsets.forEach(function (pSet) {
        var ps = new HomematicParameterSet(pSet.name, pSet.id)
        var parameter = pSet.parameter
        if (parameter !== undefined) {
          parameter.forEach(function (jParameter) {
            var p = new HomematicParameter(jParameter)
            ps.addParameter(p)
          })
        }

        self.paramsets.push(ps)
      })
    }
    // set LOWBAT to false
    var mt = this.getChannelWithTypeAndIndex('MAINTENANCE', 0)
    if (mt) {
      logger.debug('initWithStoredData Setting CONFIG_PENDING STICKY_UNREACH UNREACH to false')
      mt.updateValue('CONFIG_PENDING', false, false, true)
      mt.updateValue('STICKY_UNREACH', false, false, true)
      mt.updateValue('UNREACH', false, false, true)
    } else {
      logger.warn('Channel 0 not found')
    }

    this.initialized = true
    EventEmitter.call(this)
  }

  addChannel (channel) {
    var self = this

    this.channels.push(channel)

    channel.on('channel_value_change', function (parameter) {
      parameter.device = self.adress
      logger.debug('Channel Value event %s', parameter.name)

      if (parameter.name === 'INSTALL_TEST') {
        self.emit('device_channel_install_test', parameter)
        logger.info('INSTALL TEST on %s', channel.adress)
      } else {
        self.emit('device_channel_value_change', parameter)
      }
    })

    channel.on('event_channel_value_change', function (parameter) {
      parameter.device = self.adress
      self.emit('event_device_channel_value_change', parameter)
    })
  }

  getChannel (channelAdress) {
    var result

    this.channels.forEach((channel) => {
      if (channelAdress === channel.adress) {
        result = channel
      }
    })
    return result
  }

  resetConfigPending () {
  // get the maintenance channel
    var channel = this.getChannelWithTypeAndIndex('MAINTENANCE', 0)
    if (channel) {
      logger.debug('Reset Config Pending')
      channel.setValue('CONFIG_PENDING', false)
    }
  }

  getChannelWithTypeAndIndex (type, cindex) {
    var result
    this.channels.forEach((channel) => {
      if ((type === channel.type) && (parseInt(cindex) === parseInt(channel.index))) {
        result = channel
      }
    })
    return result
  }

  getDeviceDescription (paramset) {
    var result = {}

    var psetNames = []
    var chAdrNames = []

    this.paramsets.forEach((pSet) => {
      psetNames.push(pSet.name)
    })

    this.channels.forEach((channel) => {
      chAdrNames.push(channel.adress)
    })

    result.ADDRESS = this.adress
    result.CHILDREN = chAdrNames
    result.FIRMWARE = this.firmware
    result.FLAGS = 1
    result.INTERFACE = this.interfaceName
    result.PARAMSETS = psetNames
    result.PARENT = undefined
    result.RF_ADDRESS = 0
    result.ROAMING = 0
    result.RX_MODE = 1
    result.TYPE = this.type
    result.UPDATABLE = 1
    result.VERSION = this.version

    return result
  }

  getParamsetId (paramset) {
    var result = []

    if (paramset === undefined) {
      paramset = 'MASTER'
    }

    if (paramset === this.adress) {
      paramset = 'LINK'
    }

    this.paramsets.forEach(function (pSet) {
      if (pSet.name === paramset) {
        result = pSet.getParamsetId()
      }
    })
    return result
  }

  getParamset (paramset) {
    var result = []
    if (paramset === undefined) {
      paramset = 'MASTER'
    }

    if (paramset === this.adress) {
      paramset = 'LINK'
    }

    this.paramsets.forEach(function (pSet) {
      if (pSet.name === paramset) {
        result = pSet.getParamset()
      }
    })
    return result
  }

  getParamsetDescription (paramset) {
    var result = []

    if (paramset === undefined) {
      paramset = 'MASTER'
    }

    if (paramset === this.adress) {
      paramset = 'LINK'
    }

    this.paramsets.forEach(function (pSet) {
      if (pSet.name === paramset) {
        result = pSet.getParamsetDescription()
      }
    })
    return result
  }

  putParamset (paramset, parameter) {
    if (paramset === undefined) {
      paramset = 'MASTER'
    }

    if (paramset === this.adress) {
      paramset = 'LINK'
    }

    this.paramsets.forEach(function (pSet) {
      if (pSet.name === paramset) {
        for (var key in parameter) {
          var value = parameter[key]
          pSet.putParamsetValue(key, value)
        }
      }
    })

    return this.getParamset(paramset)
  }

  savePersistent () {
    return (JSON.stringify(this))
  }
}
