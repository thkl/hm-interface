const RPCClient = require('./RPCClient')

module.exports = class HomeMaticRPCInterfaceClient {

    constructor(ifId, host, url) {
        this.ifId = ifId
        this.host = host
        this.url = url
        this.methods = ['system.listMethods']
        this.getCapabilities()
    }

    isCapable(method) {
        return this.methods.indexOf(method) > -1
    }

    get allowedMethods() {
        return this.methods
    }

    setMethods(methodList) {
        this.methods = methodList
    }


    getCcuRpcUrl(host, url) {

        if (url === 'xmlrpc_bin://127.0.0.1:32001') {
            return 'http://' + host + ':2001'
        }
        if (url === 'xmlrpc://127.0.0.1:39292/groups') {
            return 'http://' + host + ':9292/groups'
        }
        if (url === 'xmlrpc://127.0.0.1:32010') {
            return 'http://' + host + ':2010'
        }
        return url
    }

    getCapabilities() {
        let self = this
        this.callRPCMethod('system.listMethods').then((result) => {
            self.setMethods(result)
        }).catch(error => {
            reject(error)
        })
    }


    callRPCMethod(method, parameters) {
        let self = this
        return new Promise((resolve, reject) => {
            if (self.isCapable(method)) {
                let rpc = new RPCClient()
                let url = self.getCcuRpcUrl(self.host, self.url)
                rpc.init(self.host, url, undefined)
                rpc.methodCall(method, parameters, (error, result) => {
                    if (error) {
                        reject(error)
                    } else {
                        resolve(result)
                    }
                })
            } else {
                reject('method not allowed')
            }
        })
    }
}