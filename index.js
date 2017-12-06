var crypto = require('crypto')
var fs = require('fs')
var stream = require('stream')
var util = require('util')

function noop () {}

function hash (buf, _opts) {
  return crypto.createHash(_opts.hash).update(buf).digest()
}

function PipeHash (opts, callback) {
  if (!(this instanceof PipeHash)) return new PipeHash(opts)
  stream.Transform.call(this)

  if (typeof opts === 'function') {
    callback = opts
    opts = {}
  }

  if (!callback) callback = noop
  if (!opts) opts = {}
  this._opts = opts
  this._opts.hash = opts.hash || 'sha256'               // sha256 by default
  this._opts.windowSize = 1024 * (opts.windowKiB || 64) // 64KiB by default

  this._window = Buffer.alloc(this._opts.windowSize)    // window
  this._offset = 0                                      // write offset in win
  this._accu = Buffer.alloc(0)                          // rolling hash buffer

  this.on('finish', function () { // total stream payload is shorter than win
    if (!this._accu.length) this._accu = hash(this._window, this._opts)
    this.emit('pipe-hash', this._accu)
    callback(null, this._accu)
    // this._clear(true)
  })

}

util.inherits(PipeHash, stream.Transform)

PipeHash.prototype._transform = function transform (chunk, _, next) {
  this.push(chunk) // identity

  var remaining = this._opts.windowSize - this._offset
  var boundary = remaining
  var chops = []

  if (chunk.length > remaining) { // splitting chops to 64KiB, !tail
    chops.push(chunk.slice(0, boundary))  // push head
    while (boundary <= chunk.length) {    // push body and tail
      chops.push(chunk.slice(boundary, boundary + this._opts.windowSize))
      boundary += this._opts.windowSize
    }
  } else {
    chops.push(chunk)
  }

  // copy from chunk to window and maybe hash and flush
  this._copyAndMaybeHash(chops)

  next()
}

PipeHash.prototype._copyAndMaybeHash = function copyAndMaybeHash (chops) {
  chops.forEach(function (chop) {
    // chops are at most of size 64KiB
    this._offset = chop.copy(this._window, this._offset) + this._offset
    // maybe hash and clear window
    if (this._offset === this._opts.windowSize) {
      this._accu = hash(Buffer.concat([
         this._accu,
         hash(this._window, this._opts)
       ]), this._opts)
       this._clear()
       // this._window.fill(0x00) // clearing window & resetting write offset
       // this._offset = 0
    }
  }, this)
}

PipeHash.prototype._clear = function clear (everything) {
  if (everything) this._accu = Buffer.alloc(0)
  this._window.fill(0x00) // clearing window & resetting write offset
  this._offset = 0
}

module.exports = PipeHash
