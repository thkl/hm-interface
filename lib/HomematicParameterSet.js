/*
 * File: HomematicParameterSet.js
 * Project: hm-interface
 * File Created: Sunday, 20th November 2016 10:32:04 pm
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

module.exports = class HomematicParameterSet extends EventEmitter {
  constructor (name, id) {
    super()
    // logger.debug("Create new Paramset %s" , name)
    this.name = name
    this.parameter = []
    this.id = id
  }

  addParameter (sparameter) {
    this.parameter.push(sparameter)
  }

  getParamsetDescription () {
    var result = {}
    this.parameter.forEach((p) => {
      result[p.name] = p.getDescription()
    })
    return result
  }

  getParamsetId () {
    return this.id
  }

  getParameterList () {
    var result = []
    this.parameter.forEach((p) => {
      result.push(p.name)
    })
    return result
  }

  getParamset () {
    var result = {}
    this.parameter.forEach((p) => {
      result[p.name] = p.getPValue()
    })
    return result
  }

  putParamsetValue (parameter, value) {
    var that = this
    this.parameter.forEach((p) => {
      if (p.name === parameter) {
      // issue #5
        if (that.name === 'VALUES') {
          var oldValue = p.value
          p.setValue(value)
          that.emitValueChangeEvent(parameter, oldValue, value)
        } else {
          p.setValue(value)
        }
      }
    })
  }

  getJSONValue (parameterName) {
    var result

    this.parameter.forEach((p) => {
      if (p.name === parameterName) {
        result = p.value
        switch (p.type) {
          case 'FLOAT':
            result = {
              'explicitDouble': p.value
            }
            break

          case 'BOOL':
            result = p.value !== 0
            break
        }
      }
    })
    return result
  }

  getValue (parameterName) {
    var result

    this.parameter.forEach((p) => {
      if (p.name === parameterName) {
        result = p.value
        switch (p.type) {
          case 'FLOAT':
            result = p.value
            break

          case 'BOOL':
            result = p.value !== 0
            break
        }
      }
    })

    return result
  }

  getParameterObject (parameterName) {
    var result
    this.parameter.forEach((p) => {
      if (p.name === parameterName) {
        result = p
      }
    })
    return result
  }

  setValue (parameterName, value) {
    var that = this

    this.parameter.forEach((p) => {
      if (p.name === parameterName) {
        var oldValue = p.value
        p.setValue(value)
        that.emitValueChangeEvent(parameterName, oldValue, value)
        if ((that.name === 'VALUES') && (p.name.indexOf('PRESS_') > -1)) {
        // Reset the KeyData
          p.setValue(false)
        }
      }
    })
  }

  emitValueChangeEvent (parameterName, oldValue, newValue) {
    this.emit('parameter_value_change', {
      name: parameterName,
      oldValue: oldValue,
      newValue: newValue
    })
  }

  updateValue (parameterName, value) {
    var result
    this.parameter.forEach((p) => {
      if (p.name === parameterName) {
        p.setValue(value)
        result = p
      }
    })
    return result
  }
}
