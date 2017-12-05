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
  this._debug = Buffer.alloc(0)                       // dev debug
}

util.inherits(FlowHash, stream.Transform)

FlowHash.prototype._transform = function transform (chunk, _, next) {
  this.push(chunk) // identity

  var remaining = this._queueSize - this._offset
  var boundary = remaining
  var chunks = []
  if (chunk.length > remaining) { // splitting chunks to 64KiB, !head & !tail
    chunks.push(chunk.slice(0, boundary)) // push head
    while (boundary <= chunk.length) {    // push body and tail
      chunks.push(chunk.slice(boundary, boundary + this._queueSize))
      boundary += this._queueSize
    }
  } else {
    chunks.push(chunk)
  }

  // dev debug
  this._debug = Buffer.concat([ this._debug ].concat(chunks))

  // copy from chunk to queue and maybe hash and flush
  this._copyAndMaybeHash(chunks)

  next()
}

FlowHash.prototype._copyAndMaybeHash = function copyAndMaybeHash (chunks) {
  chunks.forEach(function (chunk) {
    // chunk must fit into internal 64KiB queue !!!
    this._offset = chunk.copy(this._queue, this._offset) + this._offset
    // maybe hash and clear queue
    if (this._offset === this._queueSize) {
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
