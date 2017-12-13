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

Simply pipe thru a `PipeHash` instance or call its `.fingerprint` method.

``` js
var fs = require('fs')
var pipeHash = require('pipe-hash')

var file = __filename
var selfie = fs.createReadStream(file)
var hashPipe = pipeHash()

// high-level way to get a fingerprint from a file or directory
hashPipe.fingerprint(file, { gzip: false }, function (err, fingerprintA) {
  if (err) return console.error(err)

  // another way - consuming a readable, net socket or sim
  selfie.pipe(hashPipe)//.pipe(somewhere_else)

  // get the fingerprint once the writable side of the hashPipe has finished
  hashPipe.on('fingerprint', function (fingerprintB) {
    console.log('fingerprints identical?', fingerprintB.equals(fingerprintA))
  })

})
```

Make sure not to engage a `PipeHash` instance in multiple fingerprinting operations simultaneously. That would lead to data races and wrong fingerprints.

***

## API

### `var hashPipe = pipeHash([opts][, callback])`

Create a new `PipeHash` instance. Options default to:

``` js
{
  hash: 'blake2b', // blake2b or any name of crypto's hash functions
  blake2bDigestLength: 64, // these get passed on to blake2b-wasm
  blake2bKey: null,
  blake2bSalt: null,
  blake2bPersonal: null,
  windowKiB: 64 // size of the sliding window/internal buffer in KiB
}
```

The callback will be called after the writable side of the stream has finished and has the standard signature `callback(err, fingerprint)`. The fingerprint is a buffer.

The fabolous `blake2b-wasm` module by [mafintosh](https://github.com/mafintosh) implements `blake2b` in `WebAssembly` which allows fast hashing.

### `hashPipe.fingerprint(filepath[, opts], callback)`

Get a fingerprint from a file or directory. Options default to:

``` js
{
  gzip: true, // gzip file and tar-packed dir streams before hashing?
  dereference: false // follow symlinks when fs stating filepath?
}
```

The callback has the signature `callback(err, fingerprint)` and will be called once the entire file/directory has been hashed. The fingerprint is a buffer.

### `hashPipe.on('fingerprint', callback)`

Emitted once the writable side of the stream has finished. The callback has the signature `callback(fingerprint)`. The fingerprint is a buffer.

***

## Details

Basically a `PipeHash` instance is just a simple identity duplex stream. You can simply pipe streams or write buffers to it and it will pass them thru identically.

Internally it processes written buffers stepwise. Every time the internal buffer window reaches `opts.windowKiB` an accumulator hash digest is generated, and the internal buffer cleared subsequently. A fresh accumulator is computed as a buffered `xor` of itself with the hash of the current window buffer. When pipehashing you can process streams of any size as only chunks of them are held in memory at a given point in time.

A `PipeHash` instance emits a fingerprint once its writable side has finished. Additionally, you can pass a callback to the constructor which likewise will be called once the writable side of the stream has finished.

You can use the stream for both generation and verfication of fingerprints.

For convenience you can generate a fingerpint of a file or directory by using the public `PipeHash.prototype.fingerprint(filepath, opts, callback)` method. It internally processes the input stream indicated by filepath and calls the callback with the resulting fingerprint. Note that by default files are gzipped and directories tossed into a tarball (packed as tar archive and then gzipped) before the hashing stage. You can set `opts` to `{ gzip: false }` to prevent compression before hashing. Knowing whether a fingerprint refers to a compressed or uncompressed buffer is important for successfully verifying fingerprints. Generally, you should just stick to the defaults and use compression when juggling files.

Make sure not to engage one `PipeHash` instance in multple hashing procedures simultaneously as that would lead to data races in the internal buffer window. It is safe to use a single stream for multiple file hashes as long as the operations are performed one after the other.

***

## License

[MIT](./license.md)
