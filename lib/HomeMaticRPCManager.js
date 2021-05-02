
const HomeMaticRPCInterfaceClient = require('./HomeMaticRPCInterfaceClient')

module.exports = class HomeMaticRPCManager {

    constructor() {
        this.interfaceList = {}

        this.ifOpFlags = {
            "BidCos-RF": {
                "setInstallMode": 2,
                "deleteDevice": 3
            },
            "HmIP-RF": {
                "deleteDevice": 1  //0x02=DELETE_FLAG_FORCE
            }
        }
    }

    get interfaces() {
        return this.interfaceList
    }

    addInterface(interfaceId, host, url) {
        let oInterface = new HomeMaticRPCInterfaceClient(interfaceId, host, url)
        this.interfaceList[interfaceId] = oInterface
        oInterface.getCapabilities()
    }

    allowedMethods(interfaceId) {
        let oInterface = this.interfaceList[interfaceId]
        if (oInterface) {
            return oInterface.allowedMethods
        }
    }

    rpcCall(interfaceId, method, parameter) {
        let self = this
        return new Promise((resolve, reject) => {
            let oInterface = self.interfaceList[interfaceId]
            if (oInterface) {
                oInterface.callRPCMethod(method, parameter).then(result => { resolve(result) }).catch((error) => { reject(error) })
            } else {
                reject('unknow interface')
            }

        })
    }

    interfaceFlagsForOperation(interfaceName, operationName) {
        let flagList = this.ifOpFlags[interfaceName]
        if (flagList) {
            return flagList[operationName]
        }
    }
}