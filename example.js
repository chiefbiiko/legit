var fs = require('fs')
var pipeHash = require('.')

var file = __filename
var selfie = fs.createReadStream(file)
var hashPipe = pipeHash()

// high-level way to get a fingerprint from a file or directory
hashPipe.fingerprint(file, { gzip: false }, function (err, expected) {
  if (err) return console.error(err)

  // another way - real pipehashing - consuming a readable, net socket or sim
  selfie.pipe(hashPipe)//.pipe(somewhere_else)

  // get the fingerprint once the writable side of our hashPipe has finished
  hashPipe.on('fingerprint', function (actual) {
    console.log('fingerprints identical?', actual.equals(expected))
  })

})
