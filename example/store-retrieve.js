'use strict';

var MetaDiskClient = require('..');
var fs = require('fs');
var path = require('path');

var metadisk = new MetaDiskClient({
  baseURI: 'http://127.0.0.1:6500',
  basicauth: {
    email: 'gordon@storj.io',
    password: 'notmypassword'
  }
});

var bucket = '56d6048ab3dece1959aace73';
var filehash = null;


metadisk.createToken(bucket, 'PUSH')
  .then(function(token) {
    console.log('Created PUSH token:', token);
    console.log('Streaming file to MetaDisk...');
    return metadisk.storeFileInBucket(token.bucket, token.token, process.argv[2]);
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
    return metadisk.getFilePointer(bucket, token.token, filehash);
  }, function(err) {
    console.log(err);
  }).then(function(pointers) {
    console.log('Got pointers', pointers);
    metadisk.resolveFileFromPointers(pointers).on('data', function(chunk) {
      console.log('Got shard: ', chunk);
    }).on('error', function(err) {
      console.log('Error: ', err);
    }).on('end', function() {
      console.log('Complete file resolved!');
    });
  }, function(err) {
    console.log(err);
    console.log(err.stack);
  });
