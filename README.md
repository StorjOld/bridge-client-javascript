# THIS PACKAGE HAS BEEN DEPRECATED AS A STANDALONE MODULE. USE [STORJ/CORE](https://github.com/storj/core) INSTEAD.

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

```js
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

```js
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

License
-------

```
bridge-client-javascript - JavaScript client for Storj Bridge.
Copyright (C) 2016  Storj Labs, Inc

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
```
