var fs = require('fs')
var path = require('path')
var concat = require('concat-stream')
var legit = require('./index')
var tape = require('tape')

var pdf = path.join(__dirname, 'FastCDC.pdf')
var verifier = legit()
var readStream = fs.createReadStream(pdf)

readStream.pipe(verifier).pipe(concat(function (buf) {

  console.log(verifier._debug === buf, 'internal n passthru bufs should be identical')

}))
