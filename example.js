var fs = require('fs')
var pipeHash = require('./index')

var file = __filename
var selfie = fs.createReadStream(file)
var hashpipe = pipeHash()

// high-level way to get a fingerprint from a file or directory
hashpipe.fingerprint(file, { gzip: false }, function (err, expected) {
  if (err) return console.error(err)

  // another way - real pipehashing - consuming a readable, net socket or sim
  selfie.pipe(hashpipe)//.pipe(somewhere_else)

  // get the fingerprint once the writable side of our hashpipe has finished
  hashpipe.on('fingerprint', function (actual) {
    console.log('expected:\n', expected.toString('hex'))
    console.log('actual:\n', actual.toString('hex'))
    console.log('fingerprints equal?', actual.equals(expected))
  })

})
