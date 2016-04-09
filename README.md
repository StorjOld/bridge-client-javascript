Storj Bridge Client
===================

A Simple HTTP client for communicating with Storj Bridge.

Usage (Command Line Interface)
------------------------------

Install the Storj Bridge Command Line Interface using NPM:

```
npm install -g storj-bridge-client
```

Run the `storjcli` program to view usage:

```
storjcli --help
```

Usage (Programmatic)
--------------------

Install the Storj Bridge client tools using NPM:

```
npm install storj-bridge-client --save
```

Optionally build a browser bundle:

```
npm run build
```

### Examples

Register a user account on Storj Bridge:

```
// Import the client
var bridge = require('storj-bridge-client');

// Create unauthenticated instance
var client = new bridge.Client('https://api.storj.io');

// Register a user account
client.createUser('you@domain.tld', 'somebigsecret').then(function(result) {
  console.log(result);
}, function(err) {
  console.log(err);
});
```

Create a storage bucket for your user:

```
// Import the client
var bridge = require('storj-bridge-client');

// Authenticate with credentials
var client = new bridge.Client('https://api.storj.io', {
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
```

Store and retrieve a file from the Storj network:

```
var fs = require('fs');

// Import the library
var bridge = require('storj-bridge-client');

// Create a client authenticated with your key
var client = new bridge.Client('https://api.storj.io', {
  keypair: new bridge.KeyPair('<your_private_ecdsa_key>')
});

// Keep track of the bucket ID and file hash
var bucket = '56d6048ab3dece1959aace73';
var filehash = null;

// Create a PUSH token
client.createToken(bucket, 'PUSH').then(function(token) {
  // Stream the file upload to bridge
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
```

License
-------

Storj Bridge Client -  Copyright (C) 2016 Storj Labs, Inc

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Lesser General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License along
with this program. If not, see http://www.gnu.org/licenses/.
