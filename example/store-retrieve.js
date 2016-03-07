'use strict';

var fs = require('fs');

// Import the library
var metadisk = require('..');

// Create a client authenticated with your key
var client = new metadisk.Client('https://api.metadisk.org', {
  keypair: new metadisk.KeyPair('<your_private_ecdsa_key>')
});

// Keep track of the bucket ID and file hash
var bucket = '56d6048ab3dece1959aace73';
var filehash = null;

// Create a PUSH token
client.createToken(bucket, 'PUSH').then(function(token) {
  // Stream the file upload to metadisk
  return client.storeFileInBucket(bucket, token.token, process.argv[2]);
}).then(function(filepointer) {
  // Track the file hash for later
  filehash = filepointer.hash;
  // Create a PULL token
  return client.createToken(bucket, 'PULL');
}).then(function(token) {
  // Fetch the file pointer list
  return client.getFilePointer(bucket, token.token, filehash);
}).then(function(pointers) {
  // Open download stream from network and a writable file stream
  var download = client.resolveFileFromPointers(pointers);
  var destination = fs.createWriteStream('<write_file_to_path>');
  // Write downloaded file to disk
  download.pipe(destination);
});
