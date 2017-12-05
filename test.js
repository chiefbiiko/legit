var fs = require('fs')
var path = require('path')
var concat = require('concat-stream')
var legit = require('./index')

var tape = require('tape')

var pdf = path.join(__dirname, 'FastCDC.pdf')
// var sam = path.join(__dirname, 'sample.txt')
// var bam = path.join(__dirname, 'sam.txt')

// var transformer = new stream.Transform({
//   transform(chunk, _, next) {
//     this.push(chunk)
//     next()
//   }
// })

tape('internally split chunks can be combined to original', function (t) {
  var verifier = legit()
  var readStream = fs.createReadStream(pdf)

  t.plan(1)

  readStream.pipe(verifier).pipe(concat(function (buf) {

    t.same(verifier._debug, buf, 'internal n passthru bufs should be identical')

    // t.end()
  }))

})
