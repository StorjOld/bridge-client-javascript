'use strict';

var MetaDiskClient = require('..');

var metadisk = new MetaDiskClient({
  baseURI: 'http://127.0.0.1:6500'
});

metadisk.createUser({
  email: 'gordon@storj.io',
  password: 'notmypassword'
}).then(function(result) {
  console.log(result);
}, function(err) {
  console.log(err);
});
