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

const fs = require('fs')
const http = require('http')
const path = require('path')
const os = require('os');
const { resolve } = require('path');
const logger = require(path.join(__dirname, 'logger.js')).logger('RegaRequest')
const HomeMaticAddress = require(path.join(__dirname, 'HomeMaticAddress.js'))
const HomeMaticRegaObjects = require(path.join(__dirname, 'HomeMaticRegaObjects.js'))

module.exports = class HomeMaticRegaManager {
  constructor(options) {
    this.ccuIP = options.ccuIP || '127.0.0.1'
    this.username = options.username
    this.password = options.password
    this.timeout = 120
    this._interfaces = []
    this._devices = []
    this._channels = []
    this._rooms = []
    this._functions = []
    this._programs = []
    this._variables = []

    this._checkLocalExecution()

  }

  _checkLocalExecution() {
    if (this.ccuIP === '127.0.0.1') {
      logger.info('Local Execution ...')
      const tmpPath = os.tmpdir();
      this.localRegaHelper = path.join(tmpPath, 'hmif_regahelper.sh')
      let sname = path.join(__dirname, 'scripts', 'regahelper.txt')

      if (!fs.existsSync(this.localRegaHelper)) {
        logger.info('Helper not found create one');
        if (fs.existsSync(sname)) {
          logger.info('copy found')
          let scrpt = fs.readFileSync(sname, "utf8").toString();
          logger.info('creating helper')
          fs.writeFileSync(this.localRegaHelper, scrpt)
          fs.chmodSync(this.localRegaHelper, 700)
        } else {
          logger.error('Helper not found %s', sname)
        }
      }
      logger.info('Helper is at %s', this.localRegaHelper)

    }
  }

  loadScript(name, args) {
    let named = ((args !== undefined) && (Array.isArray(args) === false))
    let sname = path.join(__dirname, 'scripts', name + '.txt')
    if (fs.existsSync(sname)) {
      let scrpt = fs.readFileSync(sname, "utf8").toString();
      if (scrpt) {
        if (named === true) {
          Object.keys(args).forEach(key => {
            let rx = new RegExp(`%${key}%`, "g");
            scrpt = scrpt.replace(rx, args[key]);
          })
        } else {
          let idx = 0;
          args.forEach(arg => {
            idx = idx + 1;
            let rx = new RegExp('%' + idx, "g");
            scrpt = scrpt.replace(rx, arg)
          })
        }
      }
      return scrpt
    } else { return '' }
  }

  script(script, expectJSON = false, returnAll = false) {
    // if ((this.ccuIP === '127.0.0.1') && (this.localRegaHelper !== undefined)) {
    //   return this.localScript(script, expectJSON, returnAll)
    // } else {
    return this.remoteScript(script, expectJSON, returnAll)
    // }
  }


  localScript(script, expectJSON = false, returnAll = false) {
    const self = this
    logger.debug('executing local RegaScript %s ', script)
    var child_process = require('child_process');
    return new Promise((resolve, reject) => {
      const result = child_process.spawnSync(self.localRegaHelper, [], {
        input: script,
        cwd: process.cwd(),
        env: process.env,
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 30000 //kill the process after 30 seconds
      });
      if (result.error) {
        console.log(result.error)
      }
      logger.debug('result is %s', result)
      try {
        let jsr = JSON.parse(result.output[1])
        if (returnAll === true) {
          resolve(jsr)
        } else {
          let stdout = unescape(jsr.STDOUT)
          stdout = stdout.replace(/\+/g, ' ')
          if (expectJSON) {
            resolve(JSON.parse(stdout))
          } else {
            resolve(jsr.STDOUT);
          }
        }
      } catch (e) {
        logger.error('Cannot parse %s', e)
        reject(e)
      }
    })
  }


  remoteScript(script, expectJSON = false, returnAll = false) {
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
        postOptions.headers.Authorization = auth
      }
      var postReq
      try {
        postReq = http.request(postOptions, (res) => {
          var data = ''
          res.setEncoding('binary')

          res.on('data', (chunk) => {
            data += chunk.toString()
          })

          res.on('end', () => {
            var pos = data.lastIndexOf('<xml><exec>')
            var response = (data.substring(0, pos))
            logger.debug('result is %s', response)
            if (expectJSON) {
              try {
                resolve(JSON.parse(response))
              } catch (e) {
                reject(new Error('unable to parse CCU Response (' + response + ') for ' + script))
              }
            } else {
              resolve(response)
            }
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

  getValue(hmadr) {
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

  setValue(hmadr, value) {
    let self = this
    return new Promise((resolve, reject) => {
      // check explicitDouble
      if (typeof value === 'object') {
        let v = value.explicitDouble
        if (v !== undefined) {
          value = v
        }
      }
      logger.debug('Rega SetValue %s of %s', value, hmadr.address())
      var script = 'var d = dom.GetObject("' + hmadr.address() + '");if (d){d.State("' + value + '");}'
      self.script(script).then(data => resolve(data))
    })
  }

  setVariable(channel, value, callback) {
    let self = this
    return new Promise((resolve, reject) => {
      var script = 'var d = dom.GetObject("' + channel + '");if (d){d.State("' + value + '");}'
      self.script(script).then(data => resolve(data))
    })
  }

  getVariable(channel) {
    let self = this
    return new Promise((resolve, reject) => {
      var script = 'var d = dom.GetObject("' + channel + '");if (d){Write(d.State());}'
      self.script(script).then(data => resolve(data))
    })
  }

  isInt(n) {
    return Number(n) === n && n % 1 === 0
  }

  isFloat(n) {
    return n === Number(n) && n % 1 !== 0
  }

  fetchInterfaces() {
    let self = this
    return new Promise((resolve, reject) => {
      let script = self.loadScript('getallinterfaces', [])
      self.script(script, true).then((jsonResult) => {
        try {
          if ((jsonResult) && (jsonResult.interfaces)) {
            self._interfaces = jsonResult.interfaces
            resolve(jsonResult.interfaces)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  fetchRooms() {
    let self = this
    return new Promise((resolve, reject) => {
      let script = self.loadScript('getEnum', { descriptor: 'rooms', objectid: 'ID_ROOMS' })
      self.script(script, true).then((jsonResult) => {
        try {
          if ((jsonResult) && (jsonResult.rooms)) {
            self._rooms = []
            jsonResult.rooms.forEach((room) => {
              let hmRoom = new HomeMaticRegaObjects.HomeMaticRegaRoom(room.id, unescape(room.name), room.channels)
              hmRoom.description = unescape(room.description);
              self._rooms.push(hmRoom)
            })
            resolve(self._rooms)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  createRoom(newRoomName) {
    let self = this
    return new Promise((resolve, reject) => {
      let script = 'var obj = dom.CreateObject(OT_ENUM);obj.Name("' + newRoomName + '"); dom.GetObject(ID_ROOMS).Add(obj.ID());Write(\'{\"result\":\"ok\"}\');'
      self.script(script, true).then((jsonResult) => {
        resolve(jsonResult)
      })
    })
  }


  fetchFunctions() {
    let self = this
    return new Promise((resolve, reject) => {
      let script = self.loadScript('getEnum', { descriptor: 'functions', objectid: 'ID_FUNCTIONS' })
      self.script(script, true).then((jsonResult) => {
        try {
          if ((jsonResult) && (jsonResult.functions)) {
            self._functions = []
            jsonResult.functions.forEach((hfunction) => {
              let hmFunction = new HomeMaticRegaObjects.HomeMaticRegaFunction(hfunction.id, unescape(hfunction.name), hfunction.channels)
              hmFunction.description = unescape(hfunction.description);
              self._functions.push(hmFunction)
            })

            resolve(self._functions)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  createFunction(newFunctionName) {
    let self = this
    return new Promise((resolve, reject) => {
      let script = 'var obj = dom.CreateObject(OT_ENUM);obj.Name("' + newFunctionName + '"); dom.GetObject(ID_FUNCTIONS).Add(obj.ID());Write(\'{\"result\":\"ok\"}\');'
      self.script(script, true).then((jsonResult) => {
        resolve(jsonResult)
      })
    })
  }

  getLinksOrPrograms(deviceId) {
    let self = this
    return new Promise((resolve, reject) => {
      let script = self.loadScript('getchprogids', [deviceId])

      self.script(script, true).then(jsonResult => {
        try {
          resolve(jsonResult);
        } catch (e) {

        }
      })
    })
  }

  updateDeviceWithId(deviceId) {
    let self = this
    return new Promise((resolve, reject) => {
      let script = self.loadScript('getDeviceDetails', { sDeviceId: deviceId })
      self.script(script, true).then(jsonResult => {
        try {
          if ((jsonResult) && (jsonResult.device)) {
            let oDevice = self.addOrUpdateDevice(jsonResult.device)
            resolve(oDevice)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  updateDeviceStatesWithId(deviceId) {
    let self = this
    return new Promise((resolve, reject) => {
      let script = self.loadScript('getDeviceStates', { sDeviceId: deviceId })
      self.script(script, true).then(jsonResult => {
        try {
          if ((jsonResult) && (jsonResult.deviceStates)) {
            jsonResult.deviceStates.forEach(state => {
              let date = new Date(state.ts)
              state.ts = date.getUTCMilliseconds()
            })
            resolve(jsonResult.deviceStates)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  addOrUpdateChannel(jsonChannel, device) {
    let self = this
    let oChannel = self.channelById(jsonChannel.id)
    if (!oChannel) {
      oChannel = new HomeMaticRegaObjects.HomeMaticRegaChannel(jsonChannel.id, unescape(jsonChannel.name))
      self._channels.push(oChannel)
      device.addChannel(oChannel)
    }
    oChannel.fromJson(jsonChannel)

    if (jsonChannel.dp) {
      let firstDp = false
      jsonChannel.dp.forEach(jDp => {
        let dp = self.addOrUpdateDataPoint(jDp, oChannel)
        if ((firstDp === false) && ((dp.operations & 1) || (dp.operations & 4))) {
          firstDp = true
          dp.defaultDP = true
        }
      })
    }

    oChannel.buildFlags()

    return oChannel
  }

  addOrUpdateDevice(jsonDevice) {
    let self = this
    let oDevice = self.deviceByid(jsonDevice.id)
    if (!oDevice) {
      oDevice = new HomeMaticRegaObjects.HomeMaticRegaDevice(jsonDevice.id, unescape(jsonDevice.name))
      self._devices.push(oDevice)
    }
    oDevice.fromJson(jsonDevice)

    // add If Info
    let aInterface = self.interfaceByid(oDevice.interface)
    if (aInterface) {
      oDevice.interfaceName = aInterface.name
    } else {
      oDevice.interfaceName = '-'
    }

    jsonDevice.channels.forEach(channel => {
      self.addOrUpdateChannel(channel, oDevice)
    })
    return oDevice
  }

  addOrUpdateDataPoint(jsonDatapoint, channel) {
    let oDatapoint = channel.datapointById(jsonDatapoint.id)
    if (!oDatapoint) {
      oDatapoint = new HomeMaticRegaObjects.HomeMaticRegaDatapoint(jsonDatapoint.id, unescape(jsonDatapoint.name))
      oDatapoint.fromJson(jsonDatapoint)
      channel.addDataPoint(oDatapoint)
    }
    return oDatapoint
  }


  setDatapointState(datapointName, newState) {
    let self = this
    return new Promise((resolve, reject) => {
      let aScript = self.loadScript('setDatapointState', { datapointName: datapointName, newState: newState })
      self.script(aScript, true).then((jsonResult) => {
        try {
          resolve(jsonResult)
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  fetchDevices() {
    let self = this
    return new Promise((resolve, reject) => {
      let script = self.loadScript('getalldevices', [])
      self.script(script, true).then(jsonResult => {
        try {
          if ((jsonResult) && (jsonResult.devices !== undefined)) {
            self._devices = []
            self._channels = []
            logger.debug('Response from CCU with devices')
            jsonResult.devices.forEach(device => {
              if ((device.address) && (device.address.length > 0)) {
                self.addOrUpdateDevice(device)
              }
            })
            resolve(self._devices)
          } else {
            reject(new Error('No devices found'))
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  fetchVariablesbyIDs(idList) {
    let self = this
    return new Promise((resolve, reject) => {
      let aScript = self.loadScript('getVariablesById', { varlist: idList.join('\t') })
      self.script(aScript, true).then((jsonResult) => {
        let resultList = []
        try {
          if ((jsonResult) && (jsonResult.variables !== undefined)) {
            jsonResult.variables.forEach((variable) => {
              let hmVariable = self.variableByid(variable.id)
              if (hmVariable === undefined) {
                hmVariable = new HomeMaticRegaObjects.HomeMaticRegaVariable(variable.id, unescape(variable.name))
                self._variables.push(hmVariable)
              }
              resultList.push(variable);
              hmVariable.fromJson(variable)
            })
            resolve(resultList);
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  fetchVariableState(variableId) {
    let self = this
    return new Promise((resolve, reject) => {
      let aScript = self.loadScript('getVariableState', { variableId: variableId })
      self.script(aScript, true).then((jsonResult) => {
        try {
          if ((jsonResult) && (jsonResult.state !== undefined)) {
            let hmVariable = self.variableByid(variableId)
            if (hmVariable != undefined) {
              try {
                hmVariable.state(jsonResult.state)
              } catch (e) {

              }
            }
            resolve(jsonResult.state)
          } else {
            resolve(jsonResult)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  setVariableState(variableId, newState) {
    let self = this
    return new Promise((resolve, reject) => {
      let aScript = self.loadScript('setVariableState', { variableId: variableId, newState: newState })
      self.script(aScript, true).then((jsonResult) => {
        try {
          if ((jsonResult) && (jsonResult.result)) {
            let hmVariable = self.variableByid(variableId)
            if (hmVariable != undefined) {
              hmVariable.state(newState)
            }
          }
          resolve(jsonResult)
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  updateVariable(variableId, newData) {
    let self = this
    return new Promise((resolve, reject) => {
      let oVariable = this.variableByid(variableId)
      if (oVariable === undefined) {
        console.log('Local Var not found')
        oVariable = new HomeMaticRegaObjects.HomeMaticRegaVariable(variableId, unescape(newData.name))
      }
      oVariable.fromJson(newData)
      let svScrpt = oVariable.save()
      self.script(svScrpt, true).then((jsonResult) => {
        resolve(jsonResult)
      })
    })
  }

  fetchTimes() {
    let self = this
    return new Promise((resolve, reject) => {
      let aScript = self.loadScript('getTimes', {})
      self.script(aScript, true).then((jsonResult) => {
        resolve(jsonResult)
      })
    })
  }


  fetchProgrambyIDs(idList) {
    let self = this
    return new Promise((resolve, reject) => {
      var aScript = '!programs\nstring prgid;boolean df = true;Write(\'{"programs":[\');foreach(prgid, \'' + idList.join('\t') + '\'){object oprg = dom.GetObject(prgid);if(df) {df = false;} else { Write(\',\');}Write(\'{\')'
      aScript = aScript + self._scriptPartForElement('id', 'prgid', 'number', ',')
      aScript = aScript + self._scriptPartForElement('name', 'oprg.Name().UriEncode()', 'urlstring', ',')
      aScript = aScript + self._scriptPartForElement('dpInfo', 'oprg.PrgInfo()', 'urlstring', ',')
      aScript = aScript + self._scriptPartForElement('lastRun', 'oprg.ProgramLastExecuteTimeSeconds()', 'number', '')
      aScript = aScript + 'Write(\'}\');} Write(\']}\');'

      self.script(aScript, true).then((jsonResult) => {
        try {
          if ((jsonResult) && (jsonResult.programs)) {
            jsonResult.programs.forEach((program) => {
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

  fetchPrograms() {
    let self = this
    return new Promise((resolve, reject) => {
      let aScript = this.loadScript('getallprograms', [])
      self.script(aScript, true).then((jsonResult) => {
        try {
          if ((jsonResult) && (jsonResult.programs)) {
            self._programs = []
            jsonResult.programs.forEach((program) => {
              let hmProgram = self.programByid(program.id)
              if (hmProgram === undefined) {
                hmProgram = new HomeMaticRegaObjects.HomeMaticRegaProgram(program.id, unescape(program.name))
                hmProgram._copyId = program.copyid
                hmProgram._firstRule = program.firstRuleId
                hmProgram.isActive = program.active
                hmProgram.isInternal = program.internal
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

  fetchProgramDetails(programID) {
    let self = this
    return new Promise(async (resolve, reject) => {
      let prg = self.programByid(programID);
      if (!prg) {
        await self.fetchPrograms()
        prg = self.programByid(programID)
      }
      if (prg) {
        prg.rulesets = {}
        let finish = false
        let ruleId = prg._firstRule
        let ruleNr = 0;
        while (!finish) {
          let aScript = this.loadScript('getprogramrule', [ruleId])
          let rslt = await self.script(aScript, true)
          if ((rslt !== undefined) && (rslt.rule)) {
            prg.rulesets[ruleNr] = rslt.rule
            if (rslt.subRule) {
              ruleId = rslt.subRule
            } else {
              finish = true
            }
            ruleNr = ruleNr + 1;
          } else {
            finish = true
          }
        }

        resolve(prg)
      } else {
        reject(`prog ${programID} not found`)
        console.log(self._programs)
      }
    })
  }

  executeProgram(programId) {
    let self = this
    return new Promise(async (resolve, reject) => {
      let objRunResult = await self.script(self.loadScript('runprogram', { id: programId }))
      resolve(objRunResult);
    });
  }

  saveProgram(program) {
    let self = this
    console.log(JSON.stringify(program));
    return new Promise(async (resolve) => {
      let origId = program.id
      // Create an empty program at ccu and get the id back
      let objIdResult = await self.script(self.loadScript('createprogram', {
        name: program.name,
        info: program.programInfo || ''
      }), true)

      if ((objIdResult !== undefined) && (objIdResult.id !== undefined)) {
        program.id = objIdResult.id;
      }

      let ruleJobjs = [];

      // loop thru all rulesets and create new rules
      Object.keys(program.rulesets).forEach(async setID => {
        // loop thru all rulesets (if there is more than one we have to create subrulez)
        ruleJobjs.push(new Promise(resolve => {
          let ruleset = program.rulesets[setID];
          let conditionJobs = []
          let sName = 'addruleset'
          if (setID !== '0') {
            sName = 'addsubruleset'
          }
          let script = self.loadScript(sName, {
            id: program.id
          });
          self.script(script, true).then(jcRuleConditionId => {
            if ((jcRuleConditionId) && (jcRuleConditionId.rid) && (jcRuleConditionId.id)) {
              Object.keys(ruleset.conditions).forEach(async condSetId => {
                // every rule haz one or more condition sets
                let conditionSet = ruleset.conditions[condSetId];
                conditionSet.ruleId = jcRuleConditionId.rid
                conditionSet.condId = jcRuleConditionId.id
                // add all single conditions for this set
                conditionSet.condition.forEach(condition => {

                  conditionJobs.push(new Promise(resolve => {
                    let script = self.loadScript('addcondition', {
                      ruleCId: conditionSet.condId,
                      ruleCndOperatorType: conditionSet.ruleCndOperatorType,
                      operatorType: condition.operatorType,
                      conditionType: condition.conditionType,
                      conditionType2: condition.conditionType2,
                      leftValType: condition.leftValType,
                      conditionChannel: condition.conditionChannel || 65535,
                      leftVal: condition.leftVal,
                      rightVal1: condition.rightVal1,
                      rightVal1ValType: condition.rightVal1ValType,
                      rightVal2: condition.rightVal2 || 0,
                      rightVal2ValType: condition.rightVal2ValType || 65535,
                      negateCondition: condition.negateCondition
                    })
                    console.log(script)
                    self.script(script, true).then(result => {
                      console.log(result)
                      resolve()
                    })
                  })
                  )
                })

                // Save the destination stuFF
                let rid = conditionSet.ruleId
                if (ruleset.destinations) {
                  let script = self.loadScript('preparedestinations', { rid })
                  Object.keys(ruleset.destinations).forEach(destId => {
                    let destination = ruleset.destinations[destId];
                    script = script + self.loadScript('adddestination', {
                      destinationParam: destination.destinationParam,
                      destinationChannel: destination.destinationChannel,
                      destinationDP: destination.destinationDP,
                      destinationValueType: destination.destinationValueType,
                      destinationValue: destination.destinationValue,
                      destinationValueParam: destination.destinationValueParam,
                      destinationValueParamType: destination.destinationValueParamType
                    })
                  })
                  script = script + 'Write("{}");'
                  conditionJobs.push(new Promise(resolve => {
                    console.log(script)
                    self.script(script, true).then(result => {
                      console.log(result)
                      resolve()
                    })
                  })
                  )
                }
              })
              console.log("Running all the inside condition and destination jobs %s", conditionJobs.length)
              // Run all condition Jobs
              Promise.all(conditionJobs).then(() => {
                resolve() // resolve the rule job
              })
            }
          })
        })
        )
      })
      // run all the rule jobs
      console.log('Running Rule jobs %s jobs', ruleJobjs.length)
      Promise.all(ruleJobjs).then(async () => {
        console.log('done');
        await self.script(self.loadScript('finishsaveprogram', [program.id, program.active]));
        if (origId !== 65535) {
          let script = self.loadScript('updateprogram', { id: program.id, origId: origId, name: program.name });
          console.log(await self.script(script, true));
        }
        resolve(program.id);
      })
    })
  }

  fetchVariables() {
    let self = this
    return new Promise((resolve, reject) => {
      let aScript = self.loadScript('getallvariables', [])
      self.script(aScript, true).then((jsonResult) => {
        try {
          if ((jsonResult) && (jsonResult.variables)) {
            jsonResult.variables.forEach((variable) => {
              let hmVariable = self.variableByid(variable.id)
              if (hmVariable === undefined) {
                hmVariable = new HomeMaticRegaObjects.HomeMaticRegaVariable(variable.id, unescape(variable.name))
                self._variables.push(hmVariable)
              }
              hmVariable.fromJson(variable)
            })
            resolve(self._variables)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  fetchServiceMessages() {
    let self = this
    return new Promise((resolve, reject) => {
      let aScript = self.loadScript('getservicemessages', [])
      self.script(aScript, true).then((jsonResult) => {
        try {
          if ((jsonResult) && (jsonResult.service)) {
            let messages = jsonResult.service.messages
            messages.forEach(message => {
              message.triggerDevice = unescape(message.triggerDevice)
            })
            resolve(messages)
          } else {
            resolve([])
          }
        } catch (e) {
          resolve([])
        }
      })
    })
  }

  doConfirmServiceMessage(triggerID) {
    let self = this
    return new Promise((resolve, reject) => {
      let aScript = 'var o=dom.GetObject(' + triggerID + ');if(o.State()==true){o.AlReceipt();Write(\'{\"message\":\"confirmed\"}\');} else {Write(\'{\"error\":\"not found\"}\');}'
      self.script(aScript, true).then((jsonResult) => {
        resolve(jsonResult)
      })
    })
  }

  getTimeModule(modid) {
    let self = this
    return new Promise((resolve, reject) => {
      let aScript = self.loadScript('gettimemodule', { id: modid })
      self.script(aScript, true).then((jsonResult) => {
        resolve(jsonResult)
      })
    })
  }

  scriptSyntaxCheck(script) {
    let self = this
    return new Promise((resolve, reject) => {
      script = script.replace(/\"/g, '\\"')
      script = script.replace(/\'/g, '\\\'')
      let aScript = self.loadScript('syntaxCheck', { script: script })
      self.script(aScript, true).then((jsonResult) => {
        resolve(jsonResult)
      })
    })
  }




  _scriptPartForElement(elementName, functionName, type, leadingComa = '') {
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
        result = result + 'Write(\']' + leadingComa + '\');'
        return result
      } else if (type === 'enumeration') {
        result = 'Write(\'"' + elementName + '": [\');'
        result = result + 'string idf;boolean tf = true;foreach(idf,' + functionName + '){if(tf){tf=false;} else { Write(\',\');}'
        result = result + 'Write(\'\' # idf # \'\');}'
        result = result + 'Write(\']' + leadingComa + '\');'
        return result
      }
  }

  deviceByDatapointAddress(dpAddress) {
    let hmAddress = new HomeMaticAddress(dpAddress)
    if (hmAddress.isValid()) {
      let rslt = this._devices.filter((device) => {
        return device.serial === hmAddress.serial
      })
      return (rslt.length > 0) ? rslt[0] : undefined
    } else {
      console.log('unable to parse %s', dpAddress)
      return undefined
    }
  }

  deviceByid(did) {
    let rslt = this._devices.filter((device) => {
      return device.id === parseInt(did)
    })
    return (rslt.length > 0) ? rslt[0] : undefined
  }


  deviceByAddress(adr) {
    let rslt = this._devices.filter((device) => {
      return device.serial === adr
    })
    return (rslt.length > 0) ? rslt[0] : undefined
  }


  deviceByidOrSerial(did) {
    let rslt = this._devices.filter((device) => {
      return ((device.id === parseInt(did)) || (device.serial === did))
    })
    return (rslt.length > 0) ? rslt[0] : undefined
  }


  programByid(pid) {
    let rslt = this._programs.filter((program) => {
      return program.id === parseInt(pid)
    })
    return (rslt.length > 0) ? rslt[0] : undefined
  }

  variableByid(pid) {
    let rslt = this._variables.filter((variable) => {
      return variable.id === pid
    })
    return (rslt.length > 0) ? rslt[0] : undefined
  }

  variableByName(varName) {
    let rslt = this._variables.filter((variable) => {
      return variable.name === varName
    })
    return (rslt.length > 0) ? rslt[0] : undefined
  }


  interfaceByid(iid) {
    let rslt = this._interfaces.filter((aInterface) => {
      return aInterface.id === iid
    })
    let result = (rslt.length > 0) ? rslt[0] : undefined
    return result
  }

  channelById(cid) {
    let rslt = this._channels.filter((channel) => {
      return channel.id === cid
    })
    return (rslt.length > 0) ? rslt[0] : undefined
  }

  get devices() {
    return this._devices
  }

  channelbyAddress(chAddress) {
    let parts = chAddress.split(':')
    let device = this.deviceByAddress(parts[0])
    if (device) {
      return device.channelByAddress(chAddress)
    }
  }

  channelByDatapointAddress(dpAddress) {
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

  roomById(rid) {
    let rslt = this._rooms.filter((room) => {
      return room.id === rid
    })
    return (rslt.length > 0) ? rslt[0] : undefined
  }

  functionById(fid) {
    let rslt = this._functions.filter((fck) => {
      return fck.id === fid
    })
    return (rslt.length > 0) ? rslt[0] : undefined
  }

  deleteObject(regaObject) {
    let self = this
    let aScript = this.loadScript('deleteObject', { objectid: regaObject.id });
    return new Promise((resolve, reject) => {
      self.script(aScript, true).then(result => {
        resolve(result);
      })
    })
  }

  saveObject(regaObject) {
    let self = this
    return new Promise((resolve, reject) => {
      let msg = regaObject.save()
      if (msg) {
        self.script(msg).then((result) => {
          resolve(result)
        })
      } else {
        reject('no rega message')
      }
    })
  }

  setDeviceReadyConfig(device) {
    let self = this
    return new Promise((resolve, reject) => {
      let aScript = "string cId;var oD = dom.GetObject(" + device.id + ");if (oD) {foreach(cId, oD.Channels()){ var oC = dom.GetObject(cId);oC.ReadyConfig(true);} oD.ReadyConfig(true,false);Write('ok');}"
      self.script(aScript, false).then((result) => {
        device.readyconfigchannels = true
        device.readyconfig = true
        resolve(result)
      })
    })
  }

  get programList() {
    return this._programs
  }
}
