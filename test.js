var fs = require('fs')
var path = require('path')
var concat = require('concat-stream')
var legit = require('./index')

var tape = require('tape')

tape('verfifier is a simple passthru/identity stream', function (t) {

  var verifier = legit()
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

  var verifier = legit()
  var readStreamA = fs.createReadStream(path.join(__dirname, 'FastCDC.pdf'))
  var readStreamB = fs.createReadStream(path.join(__dirname, 'FastCDC.pdf'))

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

  readStreamA.on('end', finalProof)
  readStreamB.on('end', finalProof)

})

tape('flowing hash is a 32 byte buffer by default', function (t) {

  var verifier = legit()
  var readStream = fs.createReadStream(__filename)

  readStream.pipe(verifier)

  verifier.on('finish', function () {
    
    t.ok(Buffer.isBuffer(verifier._accu), 'hash is a buffer')
    t.is(verifier._accu.length, 32, 'hash should be 32 bytes long')

    t.end()
  })

})
