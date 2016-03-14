'use strict';

var fs = require('fs');
var async = require('async');
var crypto = require('crypto');
var assert = require('assert');
var querystring = require('querystring');
var request = require('request');
var ms = require('ms');
var BinaryClient = require('binaryjs-client').BinaryClient;
var EventEmitter = require('events').EventEmitter;
var ReadableStream = require('readable-stream');
var KeyPair = require('./keypair');

/**
 * Exposes a MetaDisk API client
 * @constructor
 * @param {String} uri - API base URI ('https://api.metadisk.org')
 * @param {Object} options
 * @param {KeyPair} options.keypair - KeyPair instance for request signing
 * @param {Object} options.basicauth
 * @param {String} options.basicauth.email - Email address for HTTP basic auth
 * @param {String} options.basicauth.password - Password for HTTP basic auth
 */
function Client(uri, options) {
  if (!(this instanceof Client)) {
    return new Client(uri, options);
  }

  this._options = options || {};
  this._options.baseURI = uri || 'https://api.metadisk.org';
}

/**
 * Get the remote MetaDisk API documentation and version as JSON
 * @returns {Promise}
 */
Client.prototype.getInfo = function() {
  return this._request('GET', '/', {});
};

/**
 * Registers a user account
 * @param {String} email - Email address for verification email
 * @param {String} password - Password to register (hashed automatically)
 * @returns {Promise}
 */
Client.prototype.createUser = function(email, password) {
  return this._request('POST', '/users', {
    email: email,
    password: this._sha256(password)
  });
};

/**
 * Returns list of associated public keys
 * @returns {Promise}
 */
Client.prototype.getPublicKeys = function() {
  return this._request('GET', '/keys', {});
};

/**
 * Registers a public key for the caller
 * @param {String} pubkey - Hex encoded ECDSA (secp256k1) public key
 * @returns {Promise}
 */
Client.prototype.addPublicKey = function(pubkey) {
  return this._request('POST', '/keys', { key: pubkey });
};

/**
 * Disassociates the public key from the caller
 * @param {String} pubkey - Hex encoded ECDSA (secp256k1) public key
 * @returns {Promise}
 */
Client.prototype.destroyPublicKey = function(pubkey) {
  return this._request('DELETE', '/keys/' + pubkey, {});
};

/**
 * Lists the caller's file buckets
 * @returns {Promise}
 */
Client.prototype.getBuckets = function() {
  return this._request('GET', '/buckets', {});
};

/**
 * Returns the bucket information by ID
 * @param {String} id - Unique bucket ID
 * @returns {Promise}
 */
Client.prototype.getBucketById = function(id) {
  return this._request('GET', '/buckets/' + id, {});
};

/**
 * Creates a new file bucket
 * @param {Object} data - Bucket parameters for creation
 * @returns {Promise}
 */
Client.prototype.createBucket = function(data) {
  return this._request('POST', '/buckets', data || {});
};

/**
 * Removes the bucket
 * @param {String} id - Unique bucket ID
 * @returns {Promise}
 */
Client.prototype.destroyBucketById = function(id) {
  return this._request('DELETE', '/buckets/' + id, {});
};

/**
 * Updates the bucket
 * @param {String} id - Unique bucket ID
 * @param {Object} updates - Bucket update parameters
 * @returns {Promise}
 */
Client.prototype.updateBucketById = function(id, updates) {
  return this._request('PATCH', '/buckets/' + id, updates || {});
};

/**
 * Lists the files stored in a bucket
 * @param {String} id - Unique bucket ID
 * @returns {Promise}
 */
Client.prototype.listFilesInBucket = function(id) {
  return this._request('GET', '/buckets/' + id + '/files', {});
};

/**
 * Create bucket token
 * @param {String} id - Unique bucket ID
 * @param {String} operation - PUSH or PULL (file operation)
 * @returns {Promise}
 */
Client.prototype.createToken = function(id, operation) {
  return this._request('POST', '/buckets/' + id + '/tokens', {
    operation: operation
  });
};

/**
 * Stores a file in the bucket
 * @param {String} id - Unique bucket ID
 * @param {String} token - Token from {@link Client#createToken}
 * @param {String|Buffer} file - Raw binary buffer or path to local file
 * @returns {Promise}
 */
Client.prototype.storeFileInBucket = function(id, token, file) {
  var self = this;
  var size = 0;

  assert(
    typeof window === 'undefined',
    'This method is not supported in the browser'
  );

  if (!Buffer.isBuffer(file)) {
    size = fs.statSync(file).size;
  } else {
    size = file.length;
  }

  return new Promise(function(resolve, reject) {
    request({
      method: 'PUT',
      baseUrl: self._options.baseURI,
      uri: '/buckets/' + id + '/files',
      json: true,
      timeout: ms('10m'),
      forever: true,
      headers: {
        'x-token': token,
        'x-filesize': size
      },
      formData: {
        data: Buffer.isBuffer(file) ? file : fs.createReadStream(file)
      }
    }, function(err, res, body) {
      if (err) {
        return reject(err);
      }

      if (res.statusCode !== 200 && res.statusCode !== 304) {
        return reject(new Error(body.error || body));
      }

      resolve(body);
    });
  });
};

/**
 * Retrieves a file pointer from the bucket
 * @param {String} bucket - Unique bucket ID
 * @param {String} token - Token from {@link Client#createToken}
 * @param {String} fileHash - The unique file pointer ID
 * @returns {Promise}
 */
Client.prototype.getFilePointer = function(bucket, token, fileHash) {
  var self = this;

  return new Promise(function(resolve, reject) {
    request({
      method: 'GET',
      baseUrl: self._options.baseURI,
      uri: '/buckets/' + bucket + '/files/' + fileHash,
      headers: {
        'x-token': token
      },
      json: true,
      timeout: ms('10m'),
    }, function(err, res, body) {
      if (err) {
        return reject(err);
      }

      if (res.statusCode !== 200 && res.statusCode !== 304) {
        return reject(new Error(body.error || body));
      }

      resolve(body);
    });
  });
};

/**
 * Open a series of data channels based on the returned value of
 * {@link Client#getFilePointer} to resolve all the shards and
 * reassemble them together as a binary stream
 * @param {Array} pointers - Result of {@link Client#getFilePointer}
 * @returns {ReadableStream}
 */
Client.prototype.resolveFileFromPointers = function(pointers) {
  var self;

  function resolveFile(limit, callback) {
    var emitter = new EventEmitter();

    async.mapLimit(pointers, limit, function(pointer, done) {
      var uri = pointer.channel;
      var client = new BinaryClient(uri);

      client.on('open', function() {
        var stream = client.send(null, {
          token: pointer.token,
          hash: pointer.hash,
          operation: pointer.operation
        });

        stream.on('data', function(chunk) {
          emitter.emit('data', chunk);
        });

        stream.on('end', function() {
          done();
        });

        stream.on('error', done);
      });
    }, function onAllShardsResolved(err) {
      if (err) {
        return emitter.emit('error', err);
      }

      emitter.emit('end');
    });

    return emitter;
  }

  return new ReadableStream({
    read: function() {
      var self = this;

      if (this._isResolving) {
        return;
      }

      this._isResolving = true;

      resolveFile(1).on('data', function(chunk) {
        self.push(chunk);
      }).on('end', function() {
        self.push(null);
      });
    }
  });
};

/**
 * Returns the SHA-256 hash of the given input data
 * @private
 * @param {String} data
 * @returns {String}
 */
Client.prototype._sha256 = function(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Sends a request to the metadisk-api
 * @private
 * @param {String} method - HTTP verb
 * @param {String} path - Endpoint path
 * @param {Object} params - Request parameters
 * @param {Boolean} stream - Return the raw response stream?
 * @returns {Promise}
 */
Client.prototype._request = function(method, path, params, stream) {
  var opts = {
    baseUrl: this._options.baseURI,
    uri: path,
    method: method
  };

  params.__nonce = Date.now();

  if (['GET', 'DELETE'].indexOf(method) !== -1) {
    opts.qs = params;
    opts.json = true;
  } else {
    opts.json = params;
  }

  this._authenticate(opts);

  if (stream) {
    return request(opts);
  }

  return new Promise(function(resolve, reject) {
    request(opts, function(err, res, body) {
      if (err) {
        return reject(err);
      }

      if (res.statusCode !== 200 && res.statusCode !== 304) {
        return reject(new Error(body.error || body));
      }

      resolve(body);
    });
  });
};

/**
 * Adds authentication headers to request object
 * @private
 * @param {Object} opts - Options parameter passed to request
 * @return {Object}
 */
Client.prototype._authenticate = function(opts) {
  if (this._options.keypair) {
    var payload = ['GET', 'DELETE'].indexOf(opts.method) !== -1 ?
                  querystring.stringify(opts.qs) :
                  JSON.stringify(opts.json);

    var contract = [opts.method, opts.uri, payload].join('\n');

    opts.headers = opts.headers || {};
    opts.headers['x-pubkey'] = this._options.keypair.getPublicKey();
    opts.headers['x-signature'] = this._options.keypair.sign(contract);
  } else if (this._options.basicauth) {
    opts.auth = {
      user: this._options.basicauth.email,
      pass: this._sha256(this._options.basicauth.password)
    };
  }

  return opts;
};

module.exports = Client;
