const path = require('path')
const HMInterface = require(path.join(__dirname, '..', 'index.js'))

HMInterface.logger.setDebugEnabled(true)

let logger = HMInterface.logger.logger('Example Client')
console.log(HMInterface)
let newInterfaceClientManager = new HMInterface.HomematicClientInterfaceManager({}) // just use the default settins

newInterfaceClientManager.init()

newInterfaceClientManager.on('event', message => {
  console.log(message)
})

newInterfaceClientManager.addInterface('BidCos-RF', '192.168.178.178', 2001, '/')

newInterfaceClientManager.connect()

process.on('SIGINT', async (code) => {
  logger.info('Exiting')
  await newInterfaceClientManager.stop()
  logger.info('End')
  process.exit()
})
