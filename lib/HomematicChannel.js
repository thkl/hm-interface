/*
 * File: HomematicChannel.js
 * Project: hm-interface
 * File Created: Tuesday, 12th February 2019 4:11:45 pm
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
const logger = require(path.join(__dirname, '/logger.js')).logger('Homematic Channel')
const EventEmitter = require('events')

module.exports = class HomematicChannel extends EventEmitter {
  constructor (parentAdr, parentType, adress, type, flags, direction, jps, version) {
    super()
    adress = adress.replace(/[ ]/g, '_')
    this.adress = parentAdr + ':' + adress
    this._index = adress
    this.parent_adress = parentAdr
    this.parent_type = parentType
    this.type = type
    this.flags = flags
    this.direction = direction
    this.datapoints = []
    this.version = version
    this.paramsets = []
    logger.debug('creating new channel ' + this.adress + ' of type ' + this.type)
    var self = this
    if (jps) {
      jps.forEach((pSet) => {
        var ps = new HomematicParameterSet(pSet.name, pSet.id)
        var parameter = pSet.parameter
        if (parameter !== undefined) {
          parameter.forEach((jParameter) => {
            var p = new HomematicParameter(jParameter)
            ps.addParameter(p)
          })
        }
        self.paramsets.push(ps)

        ps.on('parameter_value_change', (parameter) => {
          parameter.channel = self.adress
          logger.debug('Parameter value change event %s', parameter.name)
          self.emit('channel_value_change', parameter)
        })
      })
    } else {
      logger.error('paramsets definition for channel %s is empty', this.adress)
    }
  }

  set index (index) {
    this._index = index
  }

  get index () {
    let idx = parseInt(this._index)
    if (!isNaN(idx)) {
      return idx
    } else {
      return 0
    }
  }

  addDataPoint (datapoint) {
    this.datapoints.push(datapoint)
  }

  getChannelDescription (paramset) {
    var result = {}
    var psetNames = []

    this.paramsets.forEach((pSet) => {
      psetNames.push(pSet.name)
    })

    result.TYPE = this.type
    result.ADDRESS = this.adress
    result.RF_ADDRESS = 0
    result.PARENT = this.parent_adress
    result.PARENT_TYPE = this.parent_type
    result.INDEX = this.index
    result.UPDATABLE = true
    result.FLAGS = this.flags
    result.DIRECTION = this.direction
    result.LINK_SOURCE_ROLES = undefined
    result.LINK_TARGET_ROLES = undefined
    result.VERSION = (this.version !== undefined) ? this.version : 41
    result.PARAMSETS = psetNames
    result.AES_ACTIVE = 0

    return result
  }

  getParamsetDescription (paramset) {
    var result = []

    if (paramset === this.adress) {
      paramset = 'LINKS'
    }

    this.paramsets.forEach((pSet) => {
      if (pSet.name === paramset) {
        result = pSet.getParamsetDescription()
      }
    })

    return result
  }

  getRawParamset (paramset) {
    return this.paramsets.filter((pset) => {
      return (pset.name === paramset)
    }).pop()
  }

  getParamset (paramset) {
    var result = []

    if (paramset === this.adress) {
      paramset = 'LINKS'
    }

    this.paramsets.forEach((pSet) => {
      if (pSet.name === paramset) {
        result = pSet.getParamset()
      }
    })
    return result
  }

  putParamset (paramset, parameter) {
    if (paramset === undefined) {
      paramset = 'MASTER'
    }

    if (paramset === this.adress) {
      paramset = 'LINKS'
    }

    this.paramsets.forEach((pSet) => {
      if (pSet.name === paramset) {
        for (var key in parameter) {
          var value = parameter[key]
          pSet.putParamsetValue(key, value)
        }
      }
    })
    return this.getParamset(paramset)
  }

  getParameterObject (parameterName) {
    var result
    this.paramsets.forEach((pSet) => {
      if (pSet.name === 'VALUES') {
        result = pSet.getParameterObject(parameterName)
      }
    })
    return result
  }

  getValue (parameterName) {
    var result = []
    this.paramsets.forEach((pSet) => {
      if (pSet.name === 'VALUES') {
        result = pSet.getValue(parameterName)
      }
    })
    return result
  }

  getParamsetValue (paramsetName, parameterName) {
    var result = []

    this.paramsets.forEach((pSet) => {
      if (pSet.name === paramsetName) {
        result = pSet.getJSONValue(parameterName)
      }
    })
    return result
  }

  setParamsetValue (paramsetName, parameterName, value) {
    var self = this
    this.paramsets.forEach((pSet) => {
      if (pSet.name === paramsetName) {
        logger.debug('Channel %s set Paramset %s Value %s to %s', self.index, paramsetName, parameterName, value)
        pSet.setValue(parameterName, value)
      }
    })
  }

  getParamsetValueWithDefault (paramsetName, parameterName, defaultValue) {
    var result = defaultValue
    this.paramsets.forEach((pSet) => {
      if (pSet.name === paramsetName) {
        result = pSet.getValue(parameterName)
      }
    })
    return result
  }

  /**
   * sets a parameter at the Values Parameterset
   * @param {String} parameterName
   * @param {*} value
   */
  setValue (parameterName, value) {
    var result = []
    let self = this
    logger.debug('Channel setValue %s to %s', parameterName, value)

    this.paramsets.forEach((pSet) => {
      if (pSet.name === 'VALUES') {
        if (parameterName !== 'INHIBIT') {
          logger.debug('Check Inhibit')
          let pInhibit = self.getParameterObject('INHIBIT')
          if ((pInhibit) && (pInhibit.value === true)) {
            logger.warn('Cannot set %s on %s to %s cause channel inhibit is set', parameterName, self.adress, value)
            return
          }
        }
        logger.debug('Channel set Value %s to %s', parameterName, value)
        result = pSet.setValue(parameterName, value)
      }
    })
    return result
  }
  /**
   * Updated a parameter in the Values Paramset and creates an event
   * @param {String} parameterName - The parameter name (aka. Datapoint name)
   * @param {*} value  (The new value)
   * @param {boolean} notification - a will create an event
   * @param {boolean} force - if true there will be an event - if false only when the value changed
   * @param {boolean} autoWorking - the working parameter will be set to true before the change and to false after
   */
  updateValue (parameterName, value, notification, force, autoWorking) {
    var pv = this.getParameterObject(parameterName)
    if (pv !== undefined) {
      logger.debug('Channel %s update Event %s with %s', this.index, parameterName, value)
      // Only call once !
      if ((pv.value !== value) /* || (pv.value==pv.vdefault) */ || (force)) {
        if (notification !== undefined) {
          logger.debug('will publish events')

          if (autoWorking) {
            this.startUpdating(parameterName)
          }

          pv.setValue(value)
          this.publishUpdateEvent([pv])

          if (autoWorking) {
            this.endUpdating()
          }
        } else {
          pv.setValue(value)
        }
      } else {
        logger.debug('Ignore Value Change %s.%s event because the value doesnt change %s vs %s', this.adress, parameterName, pv.value, value)
      }
    } else {
      logger.warn('ParameterObject for %s not found in channel %s', parameterName, this.adress)
    }
  }

  startUpdating (parameterName) {
    var pw = this.getParameterObject('WORKING')
    var upChannels = []
    if (pw !== undefined) {
      this.setValue('WORKING', true)
      upChannels.push(pw)
    }

    var pv = this.getParameterObject(parameterName)
    if (pv !== undefined) {
      upChannels.push(pv)
    }

    this.publishUpdateEvent(upChannels)
  }

  endUpdating (parameterName) {
    var pw = this.getParameterObject('WORKING')
    var upParameters = []
    if (pw !== undefined) {
      this.setValue('WORKING', false)
      upParameters.push(pw)
    }

    var pv = this.getParameterObject(parameterName)
    if (pv !== undefined) {
      upParameters.push(pv)
    }

    this.publishUpdateEvent(upParameters)
  }

  publishUpdateEvent (parameterNames) {
    this.emit('event_channel_value_change', {
      channel: this.adress,
      parameters: parameterNames
    })
    this.emit('logic_event_channel_value_change', {
      channel: this.adress,
      parameters: parameterNames
    })
  }

  getParamsetId (paramset) {
    var result = []

    if (paramset === this.adress) {
      paramset = 'LINKS'
    }

    this.paramsets.forEach((pSet) => {
      if (pSet.name === paramset) {
        result = pSet.getParamsetId()
      }
    })
    return result
  }
}
