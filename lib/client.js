/**
 * @module metadisk-client
 */

'use strict';

var fs = require('fs');
var async = require('async');
var crypto = require('crypto');
var assert = require('assert');
var querystring = require('querystring');
var request = require('request');
var ms = require('ms');
var EventEmitter = require('events').EventEmitter;
var ReadableStream = require('readable-stream');
var KeyPair = require('./keypair');

/**
 * Represents a MetaDisk HTTP client
 * @constructor
 * @param {Object} options
 * @param {KeyPair} options.keypair - KeyPair instance for request signing
 * @param {String} options.basicauth.email - Email address for HTTP basic auth
 * @param {String} options.basicauth.password - Password for HTTP basic auth
 * @param {String} options.baseURI - Optional override for API location
 */
function MetaDiskClient(options) {
  if (!(this instanceof MetaDiskClient)) {
    return new MetaDiskClient(options);
  }

  assert.ok(options, 'Invalid options supplied');

  this._options = options;
  this._options.baseURI = options.baseURI || 'https://api.metadisk.org';
}

/**
 * Get version information
 * #getInfo
 * @returns {Promise}
 */
MetaDiskClient.prototype.getInfo = function() {
  return this._request('GET', '/', {});
};

/**
 * Create a user account
 * #createUser
 * @param {Object} userdata
 * @param {String} userdata.email
 * @param {String} userdata.password
 * @returns {Promise}
 */
MetaDiskClient.prototype.createUser = function(data) {
  data.password = this._sha256(data.password);
  return this._request('POST', '/users', data);
};

/**
 * Returns list of public keys
 * #getPublicKeys
 * @returns {Promise}
 */
MetaDiskClient.prototype.getPublicKeys = function() {
  return this._request('GET', '/keys', {});
};

/**
 * Registers a public key
 * #addPublicKey
 * @param {String} pubkey
 * @returns {Promise}
 */
MetaDiskClient.prototype.addPublicKey = function(pubkey) {
  return this._request('POST', '/keys', { key: pubkey });
};

/**
 * Removes the public key
 * #destroyPublicKey
 * @param {String} pubkey
 * @returns {Promise}
 */
MetaDiskClient.prototype.destroyPublicKey = function(pubkey) {
  return this._request('DELETE', '/keys/' + pubkey, {});
};

/**
 * Lists the buckets
 * #getBuckets
 * @returns {Promise}
 */
MetaDiskClient.prototype.getBuckets = function() {
  return this._request('GET', '/buckets', {});
};

/**
 * Returns the bucket by ID
 * #getBucketById
 * @param {String} id
 * @returns {Promise}
 */
MetaDiskClient.prototype.getBucketById = function(id) {
  return this._request('GET', '/buckets/' + id, {});
};

/**
 * Creates a new bucket
 * #createBucket
 * @param {Object} data
 * @returns {Promise}
 */
MetaDiskClient.prototype.createBucket = function(data) {
  return this._request('POST', '/buckets', data || {});
};

/**
 * Removes the bucket
 * #destroyBucketById
 * @param {String} id
 * @returns {Promise}
 */
MetaDiskClient.prototype.destroyBucketById = function(id) {
  return this._request('DELETE', '/buckets/' + id, {});
};

/**
 * Updates the bucket
 * #updateBucketById
 * @param {String} id
 * @param {Object} updates
 * @returns {Promise}
 */
MetaDiskClient.prototype.updateBucketById = function(id, updates) {
  return this._request('PATCH', '/buckets/' + id, updates || {});
};

/**
 * Lists the files stored in a bucket
 * #listFilesInBucket
 * @param {String} id
 * @returns {Promise}
 */
MetaDiskClient.prototype.listFilesInBucket = function(id) {
  return this._request('GET', '/buckets/' + id + '/files', {});
};

/**
 * Create bucket token
 * #createToken
 * @param {String} id
 * @param {Object} updates
 * @returns {Promise}
 */
MetaDiskClient.prototype.createToken = function(id, operation) {
  return this._request('POST', '/buckets/' + id + '/tokens', {
    operation: operation
  });
};

/**
 * Updates the bucket
 * #updateBucketById
 * @param {String} id
 * @param {Object} updates
 * @returns {Promise}
 */
MetaDiskClient.prototype.updateBucketById = function(id, updates) {
  return this._request('PATCH', '/buckets/' + id, updates || {});
};

/**
 * Stores a file in the bucket
 * #storeFileInBucket
 * @param {String} id
 * @param {String} token
 * @param {String|Buffer} file - Raw binary buffer or path to local file
 * @returns {Promise}
 */
MetaDiskClient.prototype.storeFileInBucket = function(id, token, file) {
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
 * Retrieves a file from the bucket
 * #getFileFromBucket
 * @param {String} bucket
 * @param {String} token
 * @param {String} fileHash
 * @returns {Promise}
 */
MetaDiskClient.prototype.getFilePointer = function(bucket, token, fileHash) {
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
 * Dispatches a series of requests based on the returned value of
 * MetaDiskClient#getFilePointer to resolve all the shards and reassemble
 * them together into a single Buffer
 * @param {Array} instructions
 * @param {Boolean} stream
 * @returns {ReadableStream}
 */
MetaDiskClient.prototype.resolveFileFromPointers = function(pointers) {
  var self;

  function resolveFile(limit, callback) {
    var emitter = new EventEmitter();

    async.mapLimit(pointers, limit, function(pointer, done) {
      var contact = pointer.destination;

      request({
        uri: 'http://' + contact.address + ':' + contact.port,
        method: 'POST',
        body: JSON.stringify(pointer.payload)
      }, function(err, res, body) {
        var shard;

        if (err) {
          return done(err);
        }

        try {
          shard = new Buffer(JSON.parse(body).result.data_shard, 'hex');
        } catch (err) {
          return done(err);
        }

        emitter.emit('data', shard);
        done(null);
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
 * Returns the SHA-256 hash
 * #_sha256
 * @param {String} data
 * @returns {String}
 */
MetaDiskClient.prototype._sha256 = function(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Sends a request to the metadisk-api
 * #_request
 * @param {String} method
 * @param {String} path
 * @param {Object} params
 * @param {Boolean} stream - optional return stream
 * @returns {Promise}
 */
MetaDiskClient.prototype._request = function(method, path, params, stream) {
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
 * #_authenticate
 * @param {Object} opts
 * @return {Object}
 */
MetaDiskClient.prototype._authenticate = function(opts) {
  if (this._options.keypair) {
    var payload = ['GET', 'DELETE'].indexOf(opts.method) !== -1 ?
                  querystring.stringify(opts.qs) :
                  JSON.stringify(opts.json);
    var keypair = KeyPair(this._options.privkey);
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

module.exports = MetaDiskClient;
