/*
 * File: HomematicParameter.js
 * Project: hm-interface
 * File Created: Sunday, 20th November 2016 10:31:49 pm
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

module.exports = class HomematicParameter {
  constructor (jsonElement) {
    this.name = jsonElement.name
    this.type = jsonElement.type
    this.max = jsonElement.max
    this.min = jsonElement.min
    this.vdefault = jsonElement.vdefault
    this.control = jsonElement.control
    this.flags = jsonElement.flags
    this.operations = jsonElement.operations
    this.tab_order = jsonElement.tab_order
    this.unit = jsonElement.unit
    this.valuelist = jsonElement.valuelist

    if (jsonElement.value !== undefined) {
      this.value = jsonElement.value
    } else {
      this.value = this.vdefault
    }

    // Clean up default value

    switch (this.type) {
      case 'FLOAT':
        this.value = parseFloat(this.value)
        break
      case 'BOOL' :
        this.value = ((this.value === true) || (this.value === 'true') || (this.value === 1) || (parseInt(this.value) === 1))
        break
    }
  }

  getDescription () {
    var result = {}

    if (this.control !== undefined) {
      result.CONTROL = this.control
    }

    result.FLAGS = this.flags

    result.ID = this.name

    switch (this.type) {
      case 'FLOAT':
        result.MIN = {
          'explicitDouble': this.min || 0
        }
        result.MAX = {
          'explicitDouble': this.max || 0
        }
        result.DEFAULT = {
          'explicitDouble': this.vdefault || 0
        }
        break

      case 'STRING':
        result.MIN = this.min || ''
        result.MAX = this.max || ''
        result.DEFAULT = this.vdefault || ''

        break

      default:
        result.MIN = this.min
        result.MAX = this.max
        result.DEFAULT = this.vdefault
    }

    result.OPERATIONS = this.operations
    result.TAB_ORDER = this.tab_order
    result.TYPE = this.type

    // Encoding WA

    if (this.unit === 'C') {
      this.unit = String.fromCharCode(176, 67)
    }

    result.UNIT = this.unit

    if (this.valuelist !== undefined) {
      result.VALUE_LIST = this.valuelist
    }

    return result
  }

  getPValue () {
    switch (this.type) {
      case 'FLOAT':
        return {
          'explicitDouble': this.value || 0
        }

      case 'BOOL':
        if (typeof this.value === 'number') {
          return this.value !== 0
        }

        if (typeof this.value === 'boolean') {
          return this.value
        }
        break
      default:
        return this.value
    }
  }

  setValue (newValue) {
    switch (this.type) {
      case 'FLOAT':
        this.value = parseFloat(newValue)
        break
      case 'BOOL':
        this.value = ((newValue === true) || (newValue === 'true') || (newValue === 1) || (parseInt(newValue) === 1))
        break
      default:
        this.value = newValue
    }
  }
}
