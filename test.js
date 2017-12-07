var fs = require('fs')
var path = require('path')
var concat = require('concat-stream')
var tar = require('tar-fs')
var zlib = require('zlib')
var pipeHash = require('./index')

var tape = require('tape')

tape('PipeHash is a simple passthru/identity stream', function (t) {

  var verifier = pipeHash()
  var readStreamA = fs.createReadStream(__filename)
  var readStreamB = fs.createReadStream(__filename)

  readStreamA.pipe(verifier).pipe(concat(function (bufA) {
    readStreamB.pipe(concat(function (bufB) {

      t.same(bufA, bufB, 'concatenated passthru should be identical')

      t.end()
    }))
  }))

})

tape('zero mutation', function (t) {

  var verifier = pipeHash()
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

  readStreamA.pipe(verifier)

  verifier.on('data', function (chunk) {
    bufferlistA.push(chunk)
  })

  readStreamB.on('data', function (chunk) {
    bufferlistB.push(chunk)
  })

  verifier.on('end', finalProof)
  readStreamB.on('end', finalProof)

})

tape('fingerprint hash is a 32 byte buffer by default', function (t) {

  var verifier = pipeHash()
  var readStream = fs.createReadStream(__filename)

  readStream.pipe(verifier)

  verifier.on('fingerprint', function (fingerprint) {

    t.ok(Buffer.isBuffer(fingerprint), 'hash is a buffer')
    t.is(fingerprint.length, 32, 'by default hash should be 32 bytes long')

    t.end()
  })

})

tape('PipeHash should be cleared once it emits "fingerprint"', function (t) {

  var verifier = pipeHash()
  var readStream = fs.createReadStream(__filename)
  var allZeroWindow = Buffer.alloc(verifier._opts.windowSize, 0x00)

  readStream.pipe(verifier)

  verifier.on('fingerprint', function (_) {

    t.ok(verifier._offset === 0,
         'offset should be reset to zero')
    t.ok(verifier._window.equals(allZeroWindow),
         'window should be a zero buffer of length windowSize')
    t.ok(verifier._accu.equals(Buffer.alloc(0)),
         'accumulator should be a length-zero buffer')

    t.end()
  })

})

tape('PipeHash has a public async fingerprint method', function (t) {

  var verifierA = pipeHash()
  var verifierB = pipeHash()

  var readStream = fs.createReadStream(__filename)

  readStream.pipe(zlib.createGzip()).pipe(verifierA)

  verifierA.on('fingerprint', function (fingerprintA) {

    verifierB.fingerprint(__filename, function (err, fingerprintB) {
      if (err) t.end(err)

      t.same(fingerprintB, fingerprintA, 'fingerprints should be the same')

      t.end()
    })

  })

})
