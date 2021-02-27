'use strict'

const chalk = require('chalk')
const util = require('util')
const fs = require('fs')

var DEBUG_ENABLED = false
var LOGFILE

/**
 * Logger class
 */

class Logger {
  constructor (prefix) {
    this.prefix = prefix
  }

  setDebugEnabled (enabled) {
    DEBUG_ENABLED = enabled
  }
  isDebugEnabled () {
    return DEBUG_ENABLED
  }

  setLogFile (logFile) {
    LOGFILE = logFile
  }

  getLogFile () {
    return LOGFILE
  }

  _getWriter () {
    if (LOGFILE) {
      if (!this.writer) {
        this.writer = fs.createWriteStream(LOGFILE)
      }
      return this.writer
    }
  }

  close () {
    if (this.writer) {
      this.writer.end()
    }
  }

  timestamp () {
    var ts = new Date()
    var result = '[' + ts.getFullYear() + '-'

    var value = ts.getMonth() + 1
    if (value < 10) value = '0' + value
    result += value + '-'

    value = ts.getDate()
    if (value < 10) value = '0' + value
    result += value + ' '

    value = ts.getHours()
    if (value < 10) value = '0' + value
    result += value + ':'

    value = ts.getMinutes()
    if (value < 10) value = '0' + value
    result += value + ':'

    value = ts.getSeconds()
    if (value < 10) value = '0' + value
    result += value + '.'

    value = ts.getMilliseconds()
    if (value < 10) {
      value = '00' + value
    } else
    if (value < 100) {
      value = '0' + value
    }

    result += value + ']'

    return result
  }

  debug (msg) {
    if (DEBUG_ENABLED) {
      this.log.apply(this, ['debug'].concat(Array.prototype.slice.call(arguments)))
    }
  }

  info (msg) {
    this.log.apply(this, ['info'].concat(Array.prototype.slice.call(arguments)))
  }

  warn (msg) {
    this.log.apply(this, ['warn'].concat(Array.prototype.slice.call(arguments)))
  }

  error (msg) {
    this.log.apply(this, ['error'].concat(Array.prototype.slice.call(arguments)))
  }

  log (level, msg) {
    let rawMsg = util.format.apply(util, Array.prototype.slice.call(arguments, 1))

    var func = console.log

    if (level === 'debug') {
      msg = chalk.gray(rawMsg)
    } else if (level === 'warn') {
      msg = chalk.yellow(rawMsg)
      func = console.error
    } else if (level === 'error') {
      msg = chalk.bold.red(rawMsg)
      func = console.error
    } else {
      msg = rawMsg
    }

    // prepend prefix if applicable
    if (this.prefix) {
      msg = chalk.cyan('[' + this.prefix + ']') + ' ' + msg
    }

    msg = this.timestamp() + ' ' + msg

    let writer = this._getWriter()
    if (writer) {
      var lmsg = rawMsg
      if (this.prefix) {
        lmsg = '[' + this.prefix + '] ' + lmsg
      }
      lmsg = this.timestamp() + ' ' + level + ' - ' + lmsg
      if (writer.writable) {
        writer.write(lmsg + '\n')
      }
    }

    func(msg)
  }
}

module.exports.logger = (prefix) => { return new Logger(prefix) }
module.exports.setDebugEnabled = (enabled) => { DEBUG_ENABLED = enabled }
