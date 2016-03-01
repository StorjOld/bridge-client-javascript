'use strict';

var MetaDiskClient = require('..');
var fs = require('fs');
var path = require('path');

var metadisk = new MetaDiskClient({
  baseURI: 'http://127.0.0.1:6500',
  email: 'gordon@storj.io',
  password: 'notmypassword'
});

var bucket = '56d6048ab3dece1959aace73';
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
    console.log(err.stack);
  }).then(function(buffer) {
    console.log('Successfully resolved data!', buffer);
  }, function(err) {
    console.log(err);
  });
