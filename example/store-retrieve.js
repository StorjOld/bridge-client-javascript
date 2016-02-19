'use strict';

var MetaDiskClient = require('..');
var fs = require('fs');
var path = require('path');
var DataURI = require('datauri');

var metadisk = new MetaDiskClient({
  baseURI: 'http://127.0.0.1:6500',
  privkey: 'ee1be6ddd665c88ab58a38dc78912bc238a7e6e71a274efa76293be937e759d2'
});

var bucket = '5696c61934de4d3b0f6abe83';
var filehash = null;

metadisk.createToken(bucket, 'PUSH')
  .then(function(token) {
    console.log('Created PUSH token:', token);
    console.log('Streaming file to MetaDisk...');
    var stream = fs.createReadStream(process.argv[2]);
    return metadisk.storeFileInBucket(token.bucket, token.token, stream);
  }, function(err) {
    console.log(err);
  }).then(function(filepointer) {
    console.log('File stored successfully:', filepointer);
    filehash = filepointer.hash;
    return metadisk.createToken(bucket, 'PULL');
  }, function(err) {
    console.log(err);
  }).then(function(token) {
    console.log('Created PULL token:', token);
    console.log('Getting file pointer from MetaDisk...');
    return metadisk.getFileFromBucket(bucket, token.token, filehash);
  }, function(err) {
    console.log(err);
  }).then(function(pointers) {
    console.log('Got pointers', pointers);
    return metadisk.resolveFileFromPointers(pointers);
  }, function(err) {
    console.log(err);
    console.log(err.stack)
  }).then(function(buffer) {
    console.log('Successfully resolved data!', buffer);
    console.log('Data URI:', (new DataURI()).format(
      path.extname(process.argv[2]) || '.txt',
      buffer
    ).content);
  }, function(err) {
    console.log(err);
  });
