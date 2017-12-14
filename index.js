var crypto = require('crypto')
var fs = require('fs')
var stream = require('stream')
var util = require('util')
var zlib = require('zlib')
var blake2b = require('blake2b-wasm')
var pump = require('pump')
var tar = require('tar-fs')

function noop () {}

function stat (entry, opts, cb) {
  opts.dereference ? fs.stat(entry, cb) : fs.lstat(entry, cb)
}

function xor (a, b) {
  var len = Math.max(a.length, b.length)
  var buf = Buffer.alloc(len)
  for (var i = 0; i < len; i++) buf[i] = a[i] ^ b[i]
  return buf
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

  this._opts = {}

  // hash: custom std crypto hash, or 1st default blake2b, 2nd default sha512
  this._opts.hash = opts.hash || blake2b.SUPPORTED ? 'blake2b' : 'sha512'
  this._blake2b = this._opts.hash === 'blake2b'
  this._blake2b_READY = false
  this._opts.blake2bArgs = [
    opts.blake2bDigestLength || 64,
    opts.blake2bKey || null,
    opts.blake2bSalt || null,
    opts.blake2bPersonal || null
  ]

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

  var self = this

  if (this._opts.hash === 'blake2b') {
    blake2b.ready(function (err) {
      if (err) throw err
      self._blake2b_READY = true
    })
  }

}

util.inherits(PipeHash, stream.Transform)

PipeHash.prototype._transform = function transform (chunk, _, next) {
  this.push(chunk) // passthru
  // chop, then copy to window and maybe hash and flush
  this._copyAndMaybeHash(this._chop(chunk))
  next()
}

PipeHash.prototype._chop = function chop (chunk) {
  var boundary = this._opts.windowSize - this._offset
  var chops = new Array(Math.ceil(chunk.length / this._opts.windowSize))

  if (chunk.length > boundary) {
    chops[0] = chunk.slice(0, boundary) // push head, then body and tail
    for (var i = 1; i < chops.length; i++, boundary += this._opts.windowSize) {
      chops[i] = chunk.slice(boundary, boundary + this._opts.windowSize)
    }
  } else {
    chops[0] = chunk
  }

  return chops
}

PipeHash.prototype._copyAndMaybeHash = function copyAndMaybeHash (chops) {
  chops.forEach(function (chop) { // chops are sized
    this._offset += chop.copy(this._window, this._offset)

    // maybe hash and clear window
    if (this._offset === this._opts.windowSize) {
      this._accu = xor(this._accu, this._hash(this._window))
      this._clear()
    }

  }, this)
}

PipeHash.prototype._hash = function hash (buf) {
  if (this._blake2b && this._blake2b_READY)
    return blake2b.apply(null, this._opts.blake2bArgs).update(buf).digest()
  else if (!this._blake2b)
    return crypto.createHash(this._opts.hash).update(buf).digest()
  else
    throw new Error('blake2b-wasm module is not ready yet :(')
}

PipeHash.prototype._clear = function clear (everything) {
  if (everything) this._accu = Buffer.alloc(0)
  this._window.fill(0x00)
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
