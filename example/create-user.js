'use strict';

// Import the client
var metadisk = require('..');

// Create unauthenticated instance
var client = new metadisk.Client('https://api.metadisk.org');

// Register a user account
client.createUser('you@domain.tld', 'somebigsecret').then(function(result) {
  console.log(result);
}, function(err) {
  console.log(err);
});
