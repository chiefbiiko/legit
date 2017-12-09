var crypto = require('crypto')
var fs = require('fs')
var stream = require('stream')
var util = require('util')
var zlib = require('zlib')
var pump = require('pump')
var tar = require('tar-fs')

function noop () {}

function stat (entry, _opts, cb) {
  _opts.dereference ? fs.stat(entry, cb) : fs.lstat(entry, cb)
}

function PipeHash (opts, callback) {
  if (!(this instanceof PipeHash)) return new PipeHash(opts, callback)
  stream.Transform.call(this)

  if (typeof opts === 'function') {
    callback = opts
    opts = {}
  }

  if (!callback) callback = noop
  if (!opts) opts = {}
  this._opts = opts
  this._opts.hash = opts.hash || 'sha512'               // sha512 by default
  this._opts.windowSize = 1024 * (opts.windowKiB || 64) // 64KiB by default

  this._window = Buffer.alloc(this._opts.windowSize)    // window
  this._offset = 0                                      // write offset in win
  this._accu = Buffer.alloc(0)                          // rolling hash buffer

  this.on('finish', function () { // total stream payload shorter than win?
    if (!this._accu.length) this._accu = this._hash(this._window)
    var fingerprint = Buffer.from(this._accu)
    this._clear(true)
    this.emit('fingerprint', fingerprint)
    callback(null, fingerprint)
  })

}

util.inherits(PipeHash, stream.Transform)

PipeHash.prototype._transform = function transform (chunk, _, next) {
  this.push(chunk) // identity
  // chop, then copy to window and maybe hash and flush
  this._copyAndMaybeHash(this._chop(chunk))
  next()
}

PipeHash.prototype._chop = function chop (chunk) {
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

  return chops
}

PipeHash.prototype._copyAndMaybeHash = function copyAndMaybeHash (chops) {
  chops.forEach(function (chop) { // by default chops are at most of size 64KiB
    this._offset = chop.copy(this._window, this._offset) + this._offset

    // maybe hash and clear window
    if (this._offset === this._opts.windowSize) {
      var cur = this._hash(this._window)
      this._accu = this._hash(
        Buffer.concat([ this._accu, cur ], this._accu.length + cur.length)
      )
      this._clear()
    }

  }, this)
}

PipeHash.prototype._hash = function hash (buf) {
  return crypto.createHash(this._opts.hash).update(buf).digest()
}

PipeHash.prototype._clear = function clear (everything) {
  if (everything) this._accu = Buffer.alloc(0)
  this._window.fill(0x00) // clearing window & resetting write offset
  this._offset = 0
}

PipeHash.prototype.fingerprint = function fingerprint (file, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts
    opts = {}
  }

  if (!opts) opts = {}
  if (!callback) callback = noop

  var self = this

  stat(file, opts, function (err, stats) {
    if (err) return callback(err)

    var tail
    var readStream

    if (stats.isDirectory()) readStream = tar.pack(file)
    else if (stats.isFile()) readStream = fs.createReadStream(file)
    else callback('unsupported resource')

    if (opts.gzip !== false) {
      tail = zlib.createGzip()
      pump(readStream, tail)
    } else {
      tail = readStream
      tail.on('error', tail.destroy)
    }

    tail.on('data', function (chunk) {
      self._copyAndMaybeHash(self._chop(chunk))
    })

    tail.on('end', function () {
      if (!self._accu.length) self._accu = self._hash(self._window)
      var fingerprint = Buffer.from(self._accu)
      self._clear(true)
      callback(null, fingerprint)
    })

  })

}

module.exports = PipeHash
