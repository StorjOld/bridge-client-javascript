'use strict';

var MetaDiskClient = require('..');

var metadisk = new MetaDiskClient({
  baseURI: 'http://127.0.0.1:6500',
  privkey: 'ee1be6ddd665c88ab58a38dc78912bc238a7e6e71a274efa76293be937e759d2'
});

metadisk.createUser({
  email: 'rforan@storj.io',
  password: 'notmypassword'
}).then(function(result) {
  console.log(result);
}, function(err) {
  console.log(err);
});
