var crypto = require('crypto')
var fs = require('fs')
var stream = require('stream')
var util = require('util')

function hash (buf, _opts) {
  return crypto.createHash(_opts.hash).update(buf).digest()
}

function FlowHash (opts) { // callback?
  if (!(this instanceof FlowHash)) return new FlowHash(opts)
  stream.Transform.call(this)

  if (!opts) opts = {}
  this._opts = opts
  this._opts.hash = opts.hash || 'sha256'             // sha256 by default
  this._opts.queueSize = 1024 * (opts.queueKiB || 64) // 64KiB by default

  this._queue = Buffer.alloc(this._opts.queueSize)    // internal buffer
  this._offset = 0                                    // write offset in queue
  this._accu = Buffer.alloc(0)                        // flowing hash buffer
}

util.inherits(FlowHash, stream.Transform)

FlowHash.prototype._transform = function transform (chunk, _, next) {
  this.push(chunk) // identity

  var remaining = this._opts.queueSize - this._offset
  var boundary = remaining
  var chops = []

  if (chunk.length > remaining) { // splitting chops to 64KiB, !tail
    chops.push(chunk.slice(0, boundary)) // push head
    while (boundary <= chunk.length) {    // push body and tail
      chops.push(chunk.slice(boundary, boundary + this._opts.queueSize))
      boundary += this._opts.queueSize
    }
  } else {
    chops.push(chunk)
  }

  // copy from chunk to queue and maybe hash and flush
  this._copyAndMaybeHash(chops)

  next()
}

FlowHash.prototype._copyAndMaybeHash = function copyAndMaybeHash (chops) {
  chops.forEach(function (chop) {
    // chop must fit into internal 64KiB queue !!!
    this._offset = chop.copy(this._queue, this._offset) + this._offset
    // maybe hash and clear queue
    if (this._offset === this._opts.queueSize) {
      this._accu = hash(Buffer.concat([
         this._accu,
         hash(this._queue, this._opts)
       ]), this._opts)
       this._queue.fill(0x00) // clearing queue & resetting write offset
       this._offset = 0
    }
  }, this)
}

module.exports = FlowHash
