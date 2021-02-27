/*
 * File: HomeMaticRegaRequest.js
 * Project: hm-interface
 * File Created: Saturday, 7th March 2020 2:30:06 pm
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

const http = require('http')
const path = require('path')
const logger = require(path.join(__dirname, 'logger.js')).logger('RegaRequest')
const HomeMaticAddress = require(path.join(__dirname, 'HomeMaticAddress.js'))
const HomeMaticRegaObjects = require(path.join(__dirname, 'HomeMaticRegaObjects.js'))

module.exports = class HomeMaticRegaManager {
  constructor (options) {
    this.ccuIP = options.ccuIP || '127.0.0.1'
    this.username = options.username
    this.password = options.password
    this.timeout = 120
    this.interfaces = []
    this.devices = []
    this.channels = []
    this.rooms = []
    this._programs = []
    this.variables = []
  }

  script (script) {
    let self = this
    return new Promise((resolve, reject) => {
      logger.debug('executing RegaScript %s on %s', script, self.ccuIP)

      var ls = script

      var postOptions = {
        host: self.ccuIP,
        port: '8181',
        path: '/tclrega.exe',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': script.length
        }
      }

      if ((self.username !== undefined) && (self.password !== undefined)) {
        var auth = 'Basic ' + Buffer.from(self.username + ':' + self.password).toString('base64')
        postOptions.headers['Authorization'] = auth
      }

      try {
        var postReq = http.request(postOptions, (res) => {
          var data = ''
          res.setEncoding('binary')

          res.on('data', (chunk) => {
            data += chunk.toString()
          })

          res.on('end', () => {
            var pos = data.lastIndexOf('<xml><exec>')
            var response = (data.substring(0, pos))
            logger.debug('result is %s', response)
            resolve(response)
          })
        })
      } catch (e) {
        logger.error(e)
        reject(new Error('Rega request Error'))
      }

      postReq.on('error', (e) => {
        logger.error('[Rega] Error ' + e + 'while executing rega script ' + ls)
        reject(e)
      })

      postReq.on('timeout', (e) => {
        logger.error('[Rega] timeout while executing rega script')
        postReq.destroy()
        reject(new Error('TimeOut'))
      })

      postReq.setTimeout(self.timeout * 1000)

      postReq.write(script)
      postReq.end()
    })
  }

  getValue (hmadr) {
    let self = this
    return new Promise((resolve, reject) => {
      var script = 'var d = dom.GetObject("' + hmadr.address() + '");if (d){Write(d.Value());}'
      self.script(script, (data) => {
        if (data !== undefined) {
          resolve(data)
        } else {
          reject(new Error('Invalid Data from Rega'))
        }
      })
    })
  }

  setValue (hmadr, value) {
    let self = this
    return new Promise((resolve, reject) => {
    // check explicitDouble
      if (typeof value === 'object') {
        let v = value['explicitDouble']
        if (v !== undefined) {
          value = v
        }
      }
      logger.debug('Rega SetValue %s of %s', value, hmadr.address())
      var script = 'var d = dom.GetObject("' + hmadr.address() + '");if (d){d.State("' + value + '");}'
      self.script(script).then(data => resolve(data))
    })
  }

  setVariable (channel, value, callback) {
    let self = this
    return new Promise((resolve, reject) => {
      var script = 'var d = dom.GetObject("' + channel + '");if (d){d.State("' + value + '");}'
      self.script(script).then(data => resolve(data))
    })
  }

  getVariable (channel) {
    let self = this
    return new Promise((resolve, reject) => {
      var script = 'var d = dom.GetObject("' + channel + '");if (d){Write(d.State());}'
      self.script(script).then(data => resolve(data))
    })
  }

  isInt (n) {
    return Number(n) === n && n % 1 === 0
  }

  isFloat (n) {
    return n === Number(n) && n % 1 !== 0
  }

  fetchInterfaces () {
    let self = this
    return new Promise((resolve, reject) => {
      let script = '!interfaces\nstring sifId;boolean df = true;Write(\'{"interfaces":[\');foreach(sifId, root.Interfaces().EnumIDs()){object oIf = dom.GetObject(sifId);if (oIf) {if(df) {df = false;} else { Write(\',\');}Write(\'{\')'
      script = script + self._scriptPartForElement('id', 'sifId', 'number', ',')
      script = script + self._scriptPartForElement('name', 'oIf.Name()', 'string', ',')
      script = script + self._scriptPartForElement('type', 'oIf.Type()', 'string', ',')
      script = script + self._scriptPartForElement('typename', 'oIf.TypeName()', 'string', ',')
      script = script + self._scriptPartForElement('info', 'oIf.InterfaceInfo()', 'string', ',')
      script = script + self._scriptPartForElement('url', 'oIf.InterfaceUrl()', 'string')
      script = script + 'Write(\'}\');}} Write(\']}\');'

      self.script(script).then((result) => {
        try {
          let oResult = JSON.parse(result)
          if ((oResult) && (oResult.interfaces)) {
            self.interfaces = oResult.interfaces
            resolve(oResult.interfaces)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  fetchRooms () {
    let self = this
    return new Promise((resolve, reject) => {
      let script = '!rooms\nstring rid;boolean df = true;Write(\'{"rooms":[\');foreach(rid, dom.GetObject(ID_ROOMS).EnumIDs()){object oRoom = dom.GetObject(rid);if(df) {df = false;} else { Write(\',\');}Write(\'{\')'
      script = script + self._scriptPartForElement('id', 'rid', 'number', ',')
      script = script + self._scriptPartForElement('name', 'oRoom.Name().UriEncode()', 'urlstring', ',')
      script = script + self._scriptPartForElement('channels', 'oRoom.EnumUsedIDs()', 'enumeration', '')
      script = script + 'Write(\'}\');} Write(\']}\');'

      self.script(script).then((result) => {
        try {
          let oResult = JSON.parse(result)
          if ((oResult) && (oResult.rooms)) {
            self.rooms = []
            oResult.rooms.forEach((room) => {
              let hmRoom = new HomeMaticRegaObjects.HomeMaticRegaRoom(room.id, unescape(room.name), room.channels)
              self.rooms.push(hmRoom)
              room.channels.forEach(cid => {
                let channel = self.channelById(cid)
                if (channel) {
                  channel.room = hmRoom
                }
              })
            })

            resolve(self.rooms)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  fetchDevices (includeDatapoints = false) {
    let self = this
    return new Promise((resolve, reject) => {
      let script = '!devices\nstring sDeviceId;string sChannelId;'

      if (includeDatapoints) {
        script = script + 'string sDpId;'
      }

      script = script + 'boolean df = true;Write(\'{"devices":[\');foreach(sDeviceId, root.Devices().EnumIDs()){object oDevice = dom.GetObject(sDeviceId);if(oDevice){if(df) {df = false;} else { Write(\',\');}Write(\'{\');'

      script = script + self._scriptPartForElement('id', 'sDeviceId', 'number', ',')
      script = script + self._scriptPartForElement('name', 'oDevice.Name().UriEncode()', 'string', ',')
      script = script + self._scriptPartForElement('address', 'oDevice.Address()', 'string', ',')
      script = script + self._scriptPartForElement('type', 'oDevice.HssType()', 'string', ',')
      script = script + 'Write(\'"channels": [\');boolean bcf = true;foreach(sChannelId, oDevice.Channels().EnumIDs()){object oChannel = dom.GetObject(sChannelId);'
      script = script + 'if(bcf) {bcf = false;} else {Write(\',\');}Write(\'{\');'
      script = script + self._scriptPartForElement('id', 'sChannelId', 'number', ',')
      script = script + self._scriptPartForElement('name', 'oChannel.Name().UriEncode()', 'string', ',')
      script = script + self._scriptPartForElement('intf', 'oDevice.Interface()', 'number', ',')
      script = script + self._scriptPartForElement('address', 'oChannel.Address()', 'string', ',')
      script = script + self._scriptPartForElement('type', 'oChannel.HssType()', 'string', ',')
      script = script + self._scriptPartForElement('access', 'oChannel.UserAccessRights(iulOtherThanAdmin)', 'number')

      if (includeDatapoints === true) {
        script = script + 'Write(\',\');'
        script = script + 'Write(\'"dp":[\');boolean dcf = true;foreach(sDpId,oChannel.DPs().EnumIDs()){object oDP = dom.GetObject(sDpId);'
        script = script + 'if(dcf) {dcf = false;} else {Write(\',\');}Write(\'{\');'
        script = script + self._scriptPartForElement('id', 'sDpId', 'number', ',')
        script = script + self._scriptPartForElement('name', 'oDP.Name()', 'string')
        script = script + 'Write(\'}\');}Write(\']\');'
      }

      script = script + 'Write(\'}\');}Write(\']}\');}}Write(\']}\');'
      self.script(script).then(result => {
        try {
          let oResult = JSON.parse(result)
          if ((oResult) && (oResult.devices)) {
            self.devices = []
            self.channels = []
            logger.debug('Response from CCU with devices')
            oResult.devices.forEach(device => {
              let oDevice = new HomeMaticRegaObjects.HomeMaticRegaDevice(device.id, unescape(device.name), device.address, device.type)
              self.devices.push(oDevice)
              device.channels.forEach(channel => {
                let oChannel = new HomeMaticRegaObjects.HomeMaticRegaChannel(channel.id, unescape(channel.name), channel.address)
                oDevice.addChannel(oChannel)
                self.channels.push(oChannel)

                if (includeDatapoints) {
                  channel.dp.forEach(oDp => {
                    oChannel.addDataPoint(oDp)
                  })
                }
              })
            })
            resolve(self.devices)
          } else {
            reject(new Error('No devices found'))
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  fetchProgrambyIDs (idList) {
    let self = this
    return new Promise((resolve, reject) => {
      var script = '!programs\nstring prgid;boolean df = true;Write(\'{"programs":[\');foreach(prgid, \'' + idList.join('\t') + '\'){object oprg = dom.GetObject(prgid);if(df) {df = false;} else { Write(\',\');}Write(\'{\')'
      script = script + self._scriptPartForElement('id', 'prgid', 'number', ',')
      script = script + self._scriptPartForElement('name', 'oprg.Name().UriEncode()', 'urlstring', ',')
      script = script + self._scriptPartForElement('dpInfo', 'oprg.PrgInfo()', 'urlstring', ',')
      script = script + self._scriptPartForElement('lastRun', 'oprg.ProgramLastExecuteTimeSeconds()', 'number', '')
      script = script + 'Write(\'}\');} Write(\']}\');'

      self.script(script).then((result) => {
        try {
          let oResult = JSON.parse(result)
          if ((oResult) && (oResult.programs)) {
            oResult.programs.forEach((program) => {
              let hmProgram = self.programByid(program.id)
              if (hmProgram === undefined) {
                hmProgram = new HomeMaticRegaObjects.HomeMaticRegaProgram(program.id, unescape(program.name))
                self._programs.push(hmProgram)
              }
              hmProgram.lastRun = program.lastRun
              hmProgram.programInfo = program.dpInfo
            })
            resolve(self._programs)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  fetchPrograms () {
    let self = this
    return new Promise((resolve, reject) => {
      var script = '!programs\nstring prgid;boolean df = true;Write(\'{"programs":[\');foreach(prgid, dom.GetObject(ID_PROGRAMS).EnumIDs()){object oprg = dom.GetObject(prgid);if(df) {df = false;} else { Write(\',\');}Write(\'{\')'
      script = script + self._scriptPartForElement('id', 'prgid', 'number', ',')
      script = script + self._scriptPartForElement('name', 'oprg.Name().UriEncode()', 'urlstring', ',')
      script = script + self._scriptPartForElement('dpInfo', 'oprg.PrgInfo()', 'urlstring', ',')
      script = script + self._scriptPartForElement('lastRun', 'oprg.ProgramLastExecuteTimeSeconds()', 'number', '')
      script = script + 'Write(\'}\');} Write(\']}\');'

      self.script(script).then((result) => {
        try {
          let oResult = JSON.parse(result)
          if ((oResult) && (oResult.programs)) {
            oResult.programs.forEach((program) => {
              let hmProgram = self.programByid(program.id)
              if (hmProgram === undefined) {
                hmProgram = new HomeMaticRegaObjects.HomeMaticRegaProgram(program.id, unescape(program.name))
                self._programs.push(hmProgram)
              }
              hmProgram.lastRun = program.lastRun
              hmProgram.programInfo = program.dpInfo
            })
            resolve(self._programs)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  _scriptPartForElement (elementName, functionName, type, leadingComa = '') {
    var result
    if (type === 'urlstring') {
      result = 'Write(\'"' + elementName + '": "\');'
      result = result + 'WriteXML(' + functionName + ');'
      result = result + 'Write(\'"' + leadingComa + '\');'
      return result
    } else
    if (type === 'string') {
      return 'Write(\'"' + elementName + '": "\' # ' + functionName + ' # \'"' + leadingComa + '\');'
    } else if (type === 'number') {
      return 'Write(\'"' + elementName + '": \' # ' + functionName + ' # \'' + leadingComa + '\');'
    } else if (type === 'stringenumeration') {
      result = 'Write(\'"' + elementName + '": [\');'
      result = result + 'string idf;boolean tf = true;foreach(idf,' + functionName + '){if(tf){tf=false;} else { Write(\',\');}'
      result = result + 'Write(\'"\' # idf # \'"\');}'
      result = result + 'Write(\']\');'
      return result
    } else if (type === 'enumeration') {
      result = 'Write(\'"' + elementName + '": [\');'
      result = result + 'string idf;boolean tf = true;foreach(idf,' + functionName + '){if(tf){tf=false;} else { Write(\',\');}'
      result = result + 'Write(\'\' # idf # \'\');}'
      result = result + 'Write(\']\');'
      return result
    }
  }

  deviceByDatapointAddress (dpAddress) {
    let hmAddress = new HomeMaticAddress(dpAddress)
    if (hmAddress.isValid()) {
      let rslt = this.devices.filter((device) => {
        return device.serial === hmAddress.serial
      })
      return (rslt.length > 0) ? rslt[0] : undefined
    } else {
      console.log('unable to parse %s', dpAddress)
      return undefined
    }
  }

  programByid (pid) {
    let rslt = this._programs.filter((program) => {
      return program.id === pid
    })
    return (rslt.length > 0) ? rslt[0] : undefined
  }

  channelById (cid) {
    let rslt = this.channels.filter((channel) => {
      return channel.id === cid
    })
    return (rslt.length > 0) ? rslt[0] : undefined
  }

  channelByDatapointAddress (dpAddress) {
    let hmAddress = new HomeMaticAddress(dpAddress)
    if (hmAddress.isValid()) {
      let device = this.deviceByDatapointAddress(dpAddress)
      if (device !== undefined) {
        let rslt1 = device.channels.filter((channel) => {
          return channel.address === (hmAddress.serial + ':' + hmAddress.channelId)
        })
        if (rslt1.length > 0) {
          return rslt1[0]
        }
      }
    }
  }

  get programList () {
    return this._programs
  }
}
