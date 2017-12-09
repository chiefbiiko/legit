# pipe-hash

[![build status](http://img.shields.io/travis/chiefbiiko/pipe-hash.svg?style=flat)](http://travis-ci.org/chiefbiiko/pipe-hash) [![AppVeyor Build Status](https://ci.appveyor.com/api/projects/status/github/chiefbiiko/pipe-hash?branch=master&svg=true)](https://ci.appveyor.com/project/chiefbiiko/pipe-hash)

***

An identity duplex stream that generates a rolling hash of its passthru. Use
for generating/verifying fingerprints of files/directories of arbitrary sizes.

***

## Get it!

```
npm install --save pipe-hash
```

***

## Usage

``` js
var fs = require('fs')
var pipeHash = require('pipe-hash')
var hashPipe = pipeHash()

// consuming a readable, net socket or something
fs.createReadStream(__filename).pipe(hashPipe)//.pipe(somewhere_else)

// get the fingerprint once the writable side of our hashPipe has finished
hashPipe.on('fingerprint', function (fingerprint) {
  console.log('this src file\'s fingerprint:', fingerprint.toString('hex'))
  // crosscheck against a fingerprint obtained from a trusted source...
  /*...*/
})

// high-level way to get a fingerprint from a file or directory
hashPipe.fingerprint(__dirname, function (err, fingerprint) {
  if (err) return console.error(err)
  console.log(__dirname, 'fingerprint:', fingerprint.toString('hex'))
  // share the fingerprint with a consumer for subsequent verification...
  /*...*/
})
```

***

## API

### `var hashPipe = pipeHash([opts][, callback])`

Create a new `PipeHash` instance. Options default to:

``` js
{
  hash: 'sha512', // any name of crypto's hash functions
  windowKiB: 64   // size of the sliding window in KiB
}
```

The callback will be called after the writable side of the stream has finished and has the standard signature `callback(err, fingerprint)`. The fingerprint is a buffer.

### `hashPipe.fingerprint(filepath[, opts], callback)`

Get a fingerprint from a file or directory. Options default to:

``` js
{
  gzip: true, // gzip file and tar-packed dir streams before hashing?
  dereference: false // follow symlinks?
}
```

The callback has the signature `callback(err, fingerprint)` and will be called once the entire file/directory has been hashed. The fingerprint is a buffer.

### `hashPipe.on('fingerprint', callback)`

Emitted once the writable side of the stream has finished. The callback has the signature `callback(fingerprint)`. The fingerprint is a buffer.

***

## Details

Basically a `PipeHash` instance is just a simple identity duplex stream. You can simply pipe streams or write buffers to it and it will pass them thru identically.

Internally it processes written buffers stepwise. Every time the internal buffer window reaches `opts.windowKiB` an accumulator hash digest is generated, and the internal buffer cleared subsequently. A fresh accumulator is computed as the hash of the concatenation of itself with the hash of the current window buffer. When pipehashing you can process streams of any size as only chunks of them are held in memory at a given point in time.

A `PipeHash` instance emits a fingerprint once its writable side has finished. Additionally, you can pass a callback to the constructor which likewise will be called once the writable side of the stream has finished.

You can use the stream for both generation and verfication of fingerprints.

For convenience you can generate a fingerpint of a file or directory by using the public `PipeHash.prototype.fingerprint(filepath, opts, callback)` method. It internally processes the input stream indicated by filepath and calls the callback with the resulting fingerprint. Note that by default files are gzipped and directories tossed into a tarball (packed as tar archive and then gzipped) before the hashing stage. You can set `opts` to `{ gzip: false }` to prevent compression before hashing. Knowing whether a fingerprint refers to a compressed or uncompressed buffer is important for successfully verifying fingerprints. Generally, you should just stick to the defaults and use compression when juggling files.

***

## License

[MIT](./license.md)
