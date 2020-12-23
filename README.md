This is a node implementation for an eq3 CCU Hardware Interface


Usage 
npm install hm-interface

```
const HMInterface = require('hm-interface')

let options = {
  localIp: 'XXX.XXX.XXX.XXX', // The IP the interface should listen to
  localPort: XXXX, // the port
  ccuIP: 'AAA.AAA.AAA.AAA' // The ip from your ccu ; this is needed to change the rega init urls
}

let newInteface = new HMInterface.HomematicInterface(options)
newInteface.init()

// the interface will save XMPRPC Init IDs to use after an relaunch; if you want to use saved IDs 
// (you do not have to restart rega) you can do it by :
newInteface.loadClients(options.ccuIP)

// Load a device definition and create a device
let devData = require(path.join(__dirname, 'HM-LC-Sw1-Pl.json'))
let switchDevice = newInteface.initDevice('Example', 'ABCD001234', 'HM-LC-Sw1-Pl', devData)

// Message when the interface will change the value
newInteface.on('event_device_channel_value_change', (changedObject) => {
  console.log('Device Value Change Event', JSON.stringify(changedObject))
})

// Message when rega will change the value
newInteface.on('device_channel_value_change', (changedObject) => {
  console.log('Device Value Change bySetValue', JSON.stringify(changedObject))
})

````


for more see the example

You have to add the interface to your CCU by adding it to /etc/config/InterfacesList.xml
Just add: (IP and Port see the example above)

```
	<ipc>
	 	<name>myFirstInterface</name>
	 	<url>xmlrpc://XXX.XXX.XXX.XXX:XXXX</url>
	 	<info>myFirstInterface</info>
	</ipc>
```