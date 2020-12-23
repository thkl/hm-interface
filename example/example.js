const path = require('path')
const HMInterface = require(path.join(__dirname, '..', 'index.js'))

HMInterface.logger.setDebugEnabled(true)

let logger = HMInterface.logger.logger('Example')

let options = {
  localIp: '192.168.178.172',
  localPort: 1025,
  ccuIP: '192.168.178.167'
}

let newInteface = new HMInterface.HomematicInterface(options)
newInteface.init()
newInteface.loadClients(options.ccuIP)

let devData = require(path.join(__dirname, 'HM-LC-Sw1-Pl.json'))
let switchDevice = newInteface.initDevice('Example', 'ABCD001234', 'HM-LC-Sw1-Pl', devData)

devData = require(path.join(__dirname, 'HM-LC-Dim1T-Pl.json'))
let dimmingDevice = newInteface.initDevice('Example', 'ABCD001235', 'HM-LC-Dim1T-Pl', devData)

devData = require(path.join(__dirname, 'HM-RC-19.json'))
newInteface.initDevice('Example', 'ABCD001236', 'HM-RC-19', devData)
/*
setInterval(() => {
  newInteface.startMulticallEvent(500)
  let channel = switchDevice.getChannelWithTypeAndIndex('SWITCH', 1)
  let rnd = Math.random()
  channel.updateValue('STATE', (rnd > 0.5), true, false, true)

  channel = dimmingDevice.getChannelWithTypeAndIndex('DIMMER', 1)
  rnd = Math.random()
  channel.updateValue('LEVEL', rnd, true, false, true)

  newInteface.sendMulticallEvents()
}, 5000)
*/

// Message when the interface will change the value
newInteface.on('event_device_channel_value_change', (changedObject) => {
  logger.info('Device Value Change Event', JSON.stringify(changedObject))
})

// Message when rega will change the value
newInteface.on('device_channel_value_change', (changedObject) => {
  logger.info('Device Value Change bySetValue', JSON.stringify(changedObject))
})
