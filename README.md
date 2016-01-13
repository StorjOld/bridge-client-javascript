MetaDisk Client
===============

A simple HTTP client for communicating with the MetaDisk API.

Quick Start
-----------

```bash
npm install storj/metadisk-client --save
```

```js
// import the client constructor
const MetaDiskClient = require('metadisk-client');
// create an instance with your auth options
const mdclient = new MetaDiskClient({
  baseURI: 'http://127.0.0.1:6500', // testing
  privkey: fs.readFileSync('path/to/priv.key'), // optional
  email: 'gordon@storj.io', // optional
  password: 'super secret passphrase' // optional
});
// fire at will
mdclient.getInfo().then(function(info) {
  console.log(info);
});
```

---

MOAR DOX COMING S00N.
