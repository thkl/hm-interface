const fs = require('fs')
const path = require('path')

class Util {

  static loadScript(name, args) {

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
}


class HomeMaticRegaObject {
  constructor(id, name) {
    this.id = id
    this.name = name
  }

  save() {
    return undefined
  }
}

class HomeMaticRegaVariable extends HomeMaticRegaObject {

  fromJson(jsonObject) {
    this.unerasable = jsonObject.unerasable
    this.valuetype = jsonObject.valuetype
    this.subtype = jsonObject.subtype
    this.minvalue = jsonObject.minvalue
    this.maxvalue = jsonObject.maxvalue
    this.valuelist = jsonObject.valuelist
    this.unit = jsonObject.unit
    if (jsonObject.state !== undefined) {
      this._state = jsonObject.state
    }
    this._valueName0 = jsonObject.valueName0
    this._valueName1 = jsonObject.valueName1
  }

  get valueName0() {
    return unescape(this._valueName0)
  }

  get valueName1() {
    return unescape(this._valueName1)
  }


  get wasChanged() {
    return this._wasChanged
  }

  get lastUpdate() {
    return this._lastUpdate
  }

  set state(newState) {
    if (this._state !== newState) {
      if (this.valuetype === 4) {
        this._state = parseFloat(newState)
      } else {
        this._state = newState
      }
      this._lastUpdate = new Date()
      this._wasChanged = true
    } else {
      this._wasChanged = false
    }
  }

  get state() {
    return unescape(this._state)
  }

  toJSON() {
    return {
      name: this.name,
      id: this.id,
      unerasable: this.unerasable,
      valuetype: this.valuetype,
      subtype: this.subtype,
      minvalue: this.minvalue,
      maxvalue: this.maxvalue,
      valuelist: this.valuelist,
      unit: this.unit,
      state: this._state,
      valueName0: this._valueName0,
      valueName1: this._valueName1
    }
  }

  save() {
    let scrpt = Util.loadScript('saveVariable', {
      id: this.id,
      name: this.name,
      valueType: this.valuetype,
      subType: this.subtype,
      minValue: this.minvalue || 0,
      maxValue: this.maxvalue || 0,
      valueList: this.valuelist,
      unit: this.unit,
      valueName0: this._valueName0,
      valueName1: this._valueName1
    })
    return scrpt
  }
}

class HomeMaticRegaProgram extends HomeMaticRegaObject {
  get lastRun() {
    return this._lastRun
  }

  set lastRun(lr) {
    if (lr !== this._lastRun) {
      if ((lr !== 0) && (this._lastRun !== undefined)) {
        this._lastRunChanged = true
      }
      this._lastRun = lr
    } else {
      this._lastRunChanged = false
    }
  }

  get lastRunChanged() {
    return this._lastRunChanged
  }

  get programInfo() {
    return this._programInfo
  }

  get copyID() {
    return this._copyId;
  }

  set programInfo(prgInfo) {
    this._programInfo = prgInfo
  }


  toJSON() {

    return {
      name: this.name,
      id: this.id,
      programInfo: this.programInfo,
      lastRun: this._lastRun,
      copyId: this._copyId,
      firstRuleId: this._firstRule,
      rulesets: this.rulesets,
      active: this.isActive,
      internal: this.isInternal
    }

  }
}

class HomeMaticRegaRoom extends HomeMaticRegaObject {
  constructor(id, name, channels) {
    super(id, name)
    this.channels = channels
  }

  addChannel(channel) {
    this.channels.push(channel.id)
  }

  hasChannel(channel) {
    return (this.channels.indexOf(channel.id) > -1)
  }

  save() {

    let scrp = Util.loadScript('saveEnum', {
      id: this.id,
      name: this.name,
      description: this.description
    })

    return scrp;
  }

}

class HomeMaticRegaDatapoint extends HomeMaticRegaObject {

  fromJson(jsonObject) {
    this.valuetype = jsonObject.valuetype
    this.valuesubtype = jsonObject.valuesubtype
    this.valuelist = (jsonObject.valuelist.length > 0) ? jsonObject.valuelist.split(';') : []
    this.rawUnit = jsonObject.unit
    if (unescape(jsonObject.unit) === '100%') {
      this.unit = '%'
      this.factor = 100;
    } else {
      this.unit = this.rawUnit;
      this.factor = 1;
    }

    this.operations = jsonObject.operations
    this.hssid = jsonObject.hssid
    this.min = jsonObject.min
    this.max = jsonObject.max
  }

  toJSON() {
    return {
      name: this.name,
      id: this.id,
      operations: this.operations,
      defaultDP: this.defaultDP,
      valuetype: this.valuetype,
      valuesubtype: this.valuesubtype,
      valuelist: this.valuelist,
      unit: this.unit,
      hssid: this.hssid,
      min: this.min,
      max: this.max,
      factor: this.factor,
      rawUnit: this.rawUnit,
    }
  }
}

class HomeMaticRegaChannel extends HomeMaticRegaObject {
  constructor(id, name) {
    super(id, name)
    this.datapoints = []
    this._readable = false;
    this._writable = false;
    this._eventable = false;
  }

  fromJson(jsonObject) {
    this.address = jsonObject.address

    let rgx = /([a-zA-Z0-9-]{1,}):([0-9]{1,})/g
    let parts = rgx.exec(this.address)
    if ((parts) && (parts.length > 2)) {
      this.channelIndex = parseInt(parts[2])
    }

    this.type = jsonObject.type
    this.channeltype = jsonObject.channeltype
    this.access = jsonObject.access
    this.direction = jsonObject.direction
    this.label = jsonObject.label
    if (jsonObject.rooms) {
      this.rooms = jsonObject.rooms
    }

    if (jsonObject.functions) {
      this.functions = jsonObject.functions
    }

    this.aes = jsonObject.aes
  }

  _comparer(otherArray) {
    return function (current) {
      return otherArray.filter((other) => {
        return other == current
      }).length == 0;
    }
  }

  addDataPoint(datapoint) {
    this.datapoints.push(datapoint)
  }

  datapointById(datapointId) {
    let rslt = this.datapoints.filter((datapoint) => {
      return datapoint.id === datapointId
    })
    return (rslt.length > 0) ? rslt[0] : undefined
  }

  setFunctions(newFunctionList, prepare = true) {
    let self = this
    if (newFunctionList) {
      let script = ''
      // strip ids
      let tmpNewFunctions = []
      newFunctionList.forEach(aFunction => {
        tmpNewFunctions.push(aFunction)
      })

      // first get the ids to remove
      let fcktsOut = this.functions.filter(self._comparer(tmpNewFunctions))
      let fcktsIn = tmpNewFunctions.filter(self._comparer(self.functions))
      // 

      fcktsIn.forEach(fckt => {
        script = script + `dom.GetObject(${fckt}).Add(${self.id});`
      })

      fcktsOut.forEach(fckt => {
        script = script + `dom.GetObject(${fckt}).Remove(${self.id});`
      })

      if (!prepare) {
        this.functions = tmpNewFunctions
        return tmpNewFunctions
      } else {
        return script
      }
    }
  }



  setRooms(newRoomList, prepare = true) {
    let self = this
    let script = ''
    if (newRoomList) {
      // strip ids
      let tmpNewRooms = []
      newRoomList.forEach(room => {
        tmpNewRooms.push(room)
      })

      // first get the ids to remove
      let roomsOut = this.rooms.filter(self._comparer(tmpNewRooms))
      let roomsIn = tmpNewRooms.filter(self._comparer(self.rooms))
      // 

      roomsIn.forEach(room => {
        script = script + `dom.GetObject(${room}).Add(${self.id});`
      })

      roomsOut.forEach(room => {
        script = script + `dom.GetObject(${room}).Remove(${self.id});`
      })

      if (!prepare) {
        this.rooms = tmpNewRooms
        return tmpNewRooms
      } else {
        return script
      }
    }
  }


  buildFlags() {
    let self = this
    this._readable = false;
    this._writable = false;
    this._eventable = false;
    const OPERATION_READ = 1;
    const OPERATION_WRITE = 2;
    const OPERATION_EVENT = 4;

    this.datapoints.forEach(datapoint => {
      if (datapoint.operations & OPERATION_READ) {
        self._readable = true
      }
      if (datapoint.operations & OPERATION_WRITE) {
        self._writable = true
      }
      if (datapoint.operations & OPERATION_EVENT) {
        self._eventable = true
      }
    })
  }

  get isReadable() {
    return this._readable
  }

  get isWritable() {
    return this._writable
  }

  get isEventable() {
    return this._eventable
  }

  get isVirtual() {
    return ((this.channeltype == 29) || (this.label === "HmIP-RCV-50"))
  }

  toJSON() {
    return {
      name: this.name,
      id: this.id,
      address: this.address,
      channelIndex: this.channelIndex,
      channeltype: this.channeltype,
      type: this.type,
      access: this.access,
      direction: this.direction,
      rooms: this.rooms,
      functions: this.functions,
      datapoints: this.datapoints,
      isReadable: this.isReadable,
      isWritable: this.isWritable,
      isEventable: this.isEventable,
      isVirtual: this.isVirtual,
      aes: this.aes
    }
  }

  save() {
    return 'var obj=dom.GetObject(' + this.id + ');if (obj) {obj.Name(\"' + this.name + '\");}'
  }
}

class HomeMaticRegaDevice extends HomeMaticRegaObject {
  constructor(id, name, serial, type) {
    super(id, name)
    this.channels = []
    this.channelName = {}
  }

  fromJson(jsonObject) {
    this.name = unescape(jsonObject.name)
    this.serial = jsonObject.address
    this.address = jsonObject.address
    this.type = jsonObject.type
    this.interface = jsonObject.interface
    this.inuse = jsonObject.inuse
    this.enabled = jsonObject.enabled
    this.visible = jsonObject.visible
    this.access = jsonObject.access
    this.unerasable = jsonObject.unerasable
    this.readyconfig = jsonObject.readyconfig
    this.readyconfigchannels = jsonObject.readyconfigchannels
  }

  addChannel(channel) {
    this.channels.push(channel)
  }

  channelByAddress(address) {
    let rslt = this.channels.filter(channel => {
      return channel.address === address
    })
    return rslt.length > 0 ? rslt[0] : undefined
  }

  getChannelName(address) {
    if (this.channelName[address]) {
      return this.channelName[address]
    } else {
      let channel = this.channelByAddress(address)
      if (channel) {
        if (channel.name === this.type + ' ' + channel.address) {
          // this is the default name so replace it
          this.channelName[address] = this.name + ':' + channel.channelIndex || '?'
        } else {
          this.channelName[address] = channel.name
        }
        return this.channelName[address]
      }
    }
  }

  save() {
    return 'var obj=dom.GetObject(' + this.id + ');if (obj) {obj.Name(\"' + this.name + '\");}'
  }
}

class HomeMaticRegaTimeObject extends HomeMaticRegaObject {


  constructor(id) {
    this.id = id
  }

  fromJson(tmO) {
    this.sunOffsetType = tmO.sunOffsetType
    this.calDuration = tmO.calDuration
    this.time = tmO.time
    this.timeSeconds = tmO.timeSeconds
    this.calRepeatTime = tmO.calRepeatTime
    this.period = tmO.period
    this.calRepetitionValue = tmO.calRepetitionValue
    this.weekdays = tmO.weekdays
    this.timerType = tmO.timerType
    this.begin = tmO.begin
    this.end = tmO.end
    this.calRepetitionCount = tmO.calRepetitionCount
    this.endSeconds = tmO.endSeconds
  }




}

class HomeMaticRegaFunction extends HomeMaticRegaRoom {
}


module.exports = {
  HomeMaticRegaDevice,
  HomeMaticRegaChannel,
  HomeMaticRegaDatapoint,
  HomeMaticRegaRoom,
  HomeMaticRegaVariable,
  HomeMaticRegaProgram,
  HomeMaticRegaFunction,
  HomeMaticRegaTimeObject
}
