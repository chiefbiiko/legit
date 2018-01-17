var fs = require('fs')
var path = require('path')
var zlib = require('zlib')
var concat = require('concat-stream')
var tar = require('tar-fs')
var tape = require('tape')
var pipeHash = require('./index')
var old = require('./old_index')

tape('PipeHash is a simple passthru/identity stream', function (t) {

  var hashPipe = pipeHash()
  var readStreamA = fs.createReadStream(__filename)
  var readStreamB = fs.createReadStream(__filename)

  readStreamA.pipe(hashPipe).pipe(concat(function (bufA) {
    readStreamB.pipe(concat(function (bufB) {

      t.same(bufA, bufB, 'concatenated passthru should be identical')

      t.end()
    }))
  }))

})

tape('zero mutation', function (t) {

  var hashPipe = pipeHash()
  var readStreamA = tar.pack(path.join(__dirname, 'node_modules'))
  var readStreamB = tar.pack(path.join(__dirname, 'node_modules'))
  var bufferlistA = []
  var bufferlistB = []
  var pending = 2

  function finalProof () {
    if (--pending) return

    t.same(bufferlistA, bufferlistB, 'chunks should be identical')

    t.end()
  }

  readStreamA.pipe(hashPipe)

  hashPipe.on('data', function (chunk) {
    bufferlistA.push(chunk)
  })

  readStreamB.on('data', function (chunk) {
    bufferlistB.push(chunk)
  })

  hashPipe.on('end', finalProof)
  readStreamB.on('end', finalProof)

})

tape('fingerprint hash is a 64 byte buffer by default', function (t) {

  var hashPipe = pipeHash()
  var readStream = fs.createReadStream(__filename)

  readStream.pipe(hashPipe)

  hashPipe.on('fingerprint', function (fingerprint) {

    t.ok(Buffer.isBuffer(fingerprint), 'fingerprint is a buffer')
    t.is(fingerprint.length, 64, 'by default 64 bytes long')
    t.ok(!fingerprint.equals(Buffer.alloc(64)), 'not a zero-buffer')

    t.end()
  })

})

tape('allows choosing the hash function', function (t) {

  var hashPipe = pipeHash({ hash: 'sha256' })

  hashPipe.fingerprint(__filename, function (err, fingerprint) {

    t.is(fingerprint.length, 32, 'sha256 fingerprint should be 32 bytes long')

    t.end()
  })

})

tape('PipeHash should be cleared once it emits "fingerprint"', function (t) {

  var hashPipe = pipeHash()
  var readStream = fs.createReadStream(__filename)
  var zeroBufferWindowSize = Buffer.alloc(hashPipe._opts.windowSize)

  readStream.pipe(hashPipe)

  hashPipe.on('fingerprint', function (_) {

    t.ok(hashPipe._offset === 0,
         'offset should be reset to zero')
    t.ok(hashPipe._window.equals(zeroBufferWindowSize),
         'window should be a zero buffer of length windowSize')
    t.ok(hashPipe._accu.equals(Buffer.alloc(0)),
         'accumulator should be a length-zero buffer')

    t.end()
  })

})

tape('PipeHash has a public async fingerprint method', function (t) {

  var hashPipeA = pipeHash()
  var hashPipeB = pipeHash()
  var readStream = fs.createReadStream(__filename)
  var zeroBuffer64 = Buffer.alloc(64)

  readStream.pipe(zlib.createGzip()).pipe(hashPipeA)

  hashPipeA.on('fingerprint', function (fingerprintA) {

    hashPipeB.fingerprint(__filename, function (err, fingerprintB) {
      if (err) t.end(err)

      t.ok(Buffer.isBuffer(fingerprintA) &&
           Buffer.isBuffer(fingerprintB),
           'fingerprints should be buffers')
      t.ok(fingerprintA.length === 64 &&
           fingerprintB.length === 64,
           'fingerprints should be 64 bytes long')
      t.ok(!fingerprintA.equals(zeroBuffer64) &&
           !fingerprintB.equals(zeroBuffer64),
           'fingerprints should not be zero buffers')
      t.same(fingerprintB, fingerprintA, 'fingerprints should be the same')

      t.end()
    })

  })

})

tape('deterministic', function (t) {

  var fingerprints = []
  var pending = 100

  function onfingerprint (err, fingerprint) {
    if (err) t.end(err)

    fingerprints.push(fingerprint)

    if (!--pending) {

      var check = fingerprints.every(function (fingerprint, i, arr) {
        return fingerprint.equals(arr[i + 1 < arr.length ? i + 1 : 0])
      })

      t.ok(check, 'all fingerprints should be the same')

      t.end()
    }
  }

  for (var i = 0; i < 100; i++) {
    pipeHash().fingerprint(__filename, onfingerprint)
  }

})

tape('fingerprint from stream and method are the same', function (t) {

  var self = __filename
  var selfie = fs.createReadStream(self)
  var hashPipe = pipeHash()

  hashPipe.fingerprint(self, { gzip: false }, function (err, expected) {
    if (err) t.end(err)

    selfie.pipe(hashPipe)

    hashPipe.on('fingerprint', function (actual) {

      t.ok(actual.equals(expected), 'fingerprints should be identical')

      t.end()
    })

  })

})

tape('new stream implementation should work like ancestor', function (t) {

  var a = pipeHash()
  var b = old()

  fs.createReadStream(__filename).pipe(a)

  a.on('fingerprint', function (fingerprintA) {
    fs.createReadStream(__filename).pipe(b)
    b.on('fingerprint', function (fingerprintB) {

      t.true(fingerprintB.equals(fingerprintA), 'stream fingerprints equal')
      t.end()

    })
  })

})

tape('new method implementation should work like ancestor', function (t) {

  var a = pipeHash()
  var b = old()

  a.fingerprint(__dirname, function (err, fingerprintA) {
    if (err) t.end(err)
    b.fingerprint(__dirname, function (err, fingerprintB) {
      if (err) t.end(err)

      t.true(fingerprintB.equals(fingerprintA), 'method fingerprints equal')

      t.end()
    })
  })

})
