class HomeMaticRegaObject {
  constructor (id, name) {
    this.id = id
    this.name = name
  }
}

class HomeMaticRegaVariable extends HomeMaticRegaObject {
}

class HomeMaticRegaProgram extends HomeMaticRegaObject {
  get lastRun () {
    return this._lastRun
  }

  set lastRun (lr) {
    if (lr !== this._lastRun) {
      if ((lr !== 0) && (this._lastRun !== undefined)) {
        this._lastRunChanged = true
      }
      this._lastRun = lr
    } else {
      this._lastRunChanged = false
    }
  }

  get lastRunChanged () {
    return this._lastRunChanged
  }

  get programInfo () {
    return this._programInfo
  }

  set programInfo (prgInfo) {
    this._programInfo = prgInfo
  }
}

class HomeMaticRegaRoom extends HomeMaticRegaObject {
  constructor (id, name, channels) {
    super(id, name)
    this.channels = channels
  }

  addChannel (channel) {
    this.channels.push(channel.id)
  }

  hasChannel (channel) {
    return (this.channels.indexOf(channel.id) > -1)
  }
}

class HomeMaticRegaDatapoint extends HomeMaticRegaObject {

}

class HomeMaticRegaChannel extends HomeMaticRegaObject {
  constructor (id, name, address) {
    super(id, name)
    this.address = address
    this.datapoints = []
    let rgx = /([a-zA-Z0-9-]{1,}):([0-9]{1,})/g
    let parts = rgx.exec(address)
    if ((parts) && (parts.length > 2)) {
      this.channelIndex = parseInt(parts[2])
    }
  }

  addDataPoint (datapoint) {
    this.datapoints.push(datapoint)
  }
}

class HomeMaticRegaDevice extends HomeMaticRegaObject {
  constructor (id, name, serial, type) {
    super(id, name)
    this.channels = []
    this.serial = serial
    this.type = type
    this.channelName = {}
  }

  addChannel (channel) {
    this.channels.push(channel)
  }

  channelByAddress (address) {
    let rslt = this.channels.filter(channel => {
      return channel.address === address
    })
    return rslt.length > 0 ? rslt[0] : undefined
  }

  getChannelName (address) {
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
}

module.exports = {
  HomeMaticRegaDevice,
  HomeMaticRegaChannel,
  HomeMaticRegaDatapoint,
  HomeMaticRegaRoom,
  HomeMaticRegaVariable,
  HomeMaticRegaProgram
}
