/**
 * @module metadisk-client
 */

'use strict';

const async = require('async');
const crypto = require('crypto');
const assert = require('assert');
const querystring = require('querystring');
const request = require('request');
const KeyPair = require('kad-spartacus').KeyPair;

/**
 * Represents a MetaDisk HTTP client
 * @constructor
 * @param {Object} options
 * @param {String} options.privkey
 * @param {String} options.email
 * @param {String} options.password
 * @param {String} options.baseURI
 */
function MetaDiskClient(options) {
  if (!(this instanceof MetaDiskClient)) {
    return new MetaDiskClient(options);
  }

  assert.ok(options, 'Invalid options supplied');

  this._options = options;
}

/**
 * Get version information
 * #getInfo
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
 */
MetaDiskClient.prototype.createUser = function(data) {
  data.password = this._sha256(data.password);
  return this._request('POST', '/users', data);
};

/**
 * Returns list of public keys
 * #getPublicKeys
 */
MetaDiskClient.prototype.getPublicKeys = function() {
  return this._request('GET', '/keys', {});
};

/**
 * Registers a public key
 * #addPublicKey
 * @param {String} pubkey
 */
MetaDiskClient.prototype.addPublicKey = function(pubkey) {
  return this._request('POST', '/keys', { key: pubkey });
};

/**
 * Removes the public key
 * #destroyPublicKey
 * @param {String} pubkey
 */
MetaDiskClient.prototype.destroyPublicKey = function(pubkey) {
  return this._request('DELETE', '/keys/' + pubkey, {});
};

/**
 * Lists the buckets
 * #getBuckets
 */
MetaDiskClient.prototype.getBuckets = function() {
  return this._request('GET', '/buckets', {});
};

/**
 * Returns the bucket by ID
 * #getBucketById
 * @param {String} id
 */
MetaDiskClient.prototype.getBucketById = function(id) {
  return this._request('GET', '/buckets/' + id, {});
};

/**
 * Creates a new bucket
 * #createBucket
 * @param {Object} data
 */
MetaDiskClient.prototype.createBucket = function(data) {
  return this._request('POST', '/buckets', data || {});
};

/**
 * Removes the bucket
 * #destroyBucketById
 * @param {String} id
 */
MetaDiskClient.prototype.destroyBucketById = function(id) {
  return this._request('DELETE', '/buckets/' + id, {});
};

/**
 * Updates the bucket
 * #updateBucketById
 * @param {String} id
 * @param {Object} updates
 */
MetaDiskClient.prototype.updateBucketById = function(id, updates) {
  return this._request('PATCH', '/buckets/' + id, updates || {});
};

/**
 * Create bucket token
 * #createToken
 * @param {String} id
 * @param {Object} updates
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
 */
MetaDiskClient.prototype.updateBucketById = function(id, updates) {
  return this._request('PATCH', '/buckets/' + id, updates || {});
};

/**
 * Stores a file in the bucket
 * #storeFileInBucket
 * @param {String} id
 * @param {String} token
 * @param {stream.Readable} fileStream
 */
MetaDiskClient.prototype.storeFileInBucket = function(id, token, fileStream) {
  var self = this;

  return new Promise(function(resolve, reject) {
    fileStream.pipe(request({
      method: 'PUT',
      baseUrl: self._options.baseURI,
      uri: '/buckets/' + id,
      json: true,
      timeout: 60 * (60 * 1000),
      forever: true,
      headers: {
        'x-token': token
      }
    }, function(err, res, body) {
      if (err) {
        return reject(err);
      }

      if (res.statusCode !== 200 && res.statusCode !== 304) {
        return reject(new Error(body.error || body));
      }

      resolve(body);
    }));
  });
};

/**
 * Retrieves a file from the bucket
 * #getFileFromBucket
 * @param {String} id
 * @param {String} token
 * @param {String} fileHash
 */
MetaDiskClient.prototype.getFileFromBucket = function(id, token, fileHash) {
  var self = this;

  return new Promise(function(resolve, reject) {
    request({
      method: 'GET',
      baseUrl: self._options.baseURI,
      uri: '/buckets/' + id + '/' + fileHash,
      headers: {
        'x-token': token
      },
      json: true,
      timeout: 60 * (60 * 1000),
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
 * MetaDiskClient#getFileFromBucket to resolve all the shards and reassemble
 * them together into a single Buffer
 * @param {Array} instructions
 */
MetaDiskClient.prototype.resolveFileFromPointers = function(pointers) {
  var self;

  return new Promise(function(resolve, reject) {
    async.map(pointers, function(pointer, done) {
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

        done(null, shard);
      });
    }, function onAllShardsResolved(err, shards) {
      if (err) {
        return reject(err);
      }

      resolve(Buffer.concat(shards));
    });
  });
};

/**
 * Returns the SHA-256 hash
 * #_sha256
 * @param {String} data
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
  let opts = {
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
  if (this._options.privkey) {
    let payload = ['GET', 'DELETE'].indexOf(opts.method) !== -1 ?
                  querystring.stringify(opts.qs) :
                  JSON.stringify(opts.json);
    let keypair = KeyPair(this._options.privkey);
    let contract = [opts.method, opts.uri, payload].join('\n');

    opts.headers = opts.headers || {};
    opts.headers['x-pubkey'] = keypair.getPublicKey();
    opts.headers['x-signature'] = keypair.sign(contract);
  } else if (this._options.email && this._options.password) {
    opts.auth = {
      user: this._options.email,
      pass: this._sha256(this._options.password)
    };
  }

  return opts;
};

module.exports = MetaDiskClient;
