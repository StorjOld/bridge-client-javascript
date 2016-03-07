'use strict';

// Import the client
var metadisk = require('..');

// Authenticate with credentials
var client = new metadisk.Client('https://api.metadisk.org', {
  basicauth: {
    email: 'you@domain.tld',
    password: 'somebigsecret'
  }
});

// Create a bucket and print the result
client.createBucket().then(function(result) {
  console.log(result);
}, function(err) {
  console.log(err);
});
