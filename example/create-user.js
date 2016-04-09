'use strict';

// Import the client
var StorjAPI = require('..');

// Create unauthenticated instance
var client = new StorjAPI.Client('https://api.storj.io');

// Register a user account
client.createUser('you@domain.tld', 'somebigsecret').then(function(result) {
  console.log(result);
}, function(err) {
  console.log(err);
});
