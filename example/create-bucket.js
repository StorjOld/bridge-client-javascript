'use strict';

// Import the client
var StorjAPI = require('..');

// Authenticate with credentials
var client = new StorjAPI.Client('https://api.storj.io', {
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
