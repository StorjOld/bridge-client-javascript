'use strict';

var fs = require('fs');
var querystring = require('querystring');
var request = require('request');
var storj = require('storj');
var crypto = require('crypto');
var tmpdir = require('os').tmpdir();
var path = require('path');
var mime = require('mime');
var async = require('async');

/**
 * Exposes a Storj Bridge API client
 * @constructor
 * @param {String} uri - API base URI ('https://api.storj.io')
 * @param {Object} options
 * @param {storj.KeyPair} options.keypair - KeyPair instance for request signing
 * @param {Object} options.basicauth
 * @param {String} options.basicauth.email - Email address for HTTP basic auth
 * @param {String} options.basicauth.password - Password for HTTP basic auth
 */
function Client(uri, options) {
  if (!(this instanceof Client)) {
    return new Client(uri, options);
  }

  this._options = options || {};
  this._options.baseURI = uri || 'https://api.storj.io';
}

/**
 * Get the remote Storj Bridge API documentation and version as JSON
 * @returns {Promise}
 */
Client.prototype.getInfo = function() {
  return this._request('GET', '/', {});
};

/**
 * Registers a user account
 * @param {String} email - Email address for verification email
 * @param {String} password - Password to register (hashed automatically)
 * @param {String} redirect - URL to redirect to after verification
 * @param {String} pubkey - Optional ECDSA public key to register
 * @returns {Promise}
 */
Client.prototype.createUser = function(email, password, redirect, pubkey) {
  return this._request('POST', '/users', {
    email: email,
    password: storj.utils.sha256(password),
    redirect: redirect,
    pubkey: pubkey
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
 * Removes a file from a bucket
 * @param {String} id - Unique bucket ID
 * @param {String} hash - Hash of the file to remove from bucket
 * @returns {Promise}
 */
Client.prototype.removeFileFromBucket = function(id, hash) {
  return this._request('DELETE', '/buckets/' + id + '/files/' + hash, {});
};

/**
 * Creates a file staging frame
 * @returns {Promise}
 */
Client.prototype.createFileStagingFrame = function() {
  return this._request('POST', '/frames', {});
};

/**
 * Creates a file staging frame
 * @returns {Promise}
 */
Client.prototype.getFileStagingFrames = function() {
  return this._request('GET', '/frames', {});
};

/**
 * Creates a file staging frame
 * @param {String} id - Unique frame ID
 * @returns {Promise}
 */
Client.prototype.getFileStagingFrameById = function(id) {
  return this._request('GET', '/frames/' + id, {});
};

/**
 * Creates a file staging frame
 * @param {String} id - Unique frame ID
 * @returns {Promise}
 */
Client.prototype.destroyFileStagingFrameById = function(id) {
  return this._request('DELETE', '/frames/' + id, {});
};

/**
 * Creates a file staging frame
 * @param {String} id - Unique frame ID
 * @param {Object} shard - The shard metadata
 * @returns {Promise}
 */
Client.prototype.addShardToFileStagingFrame = function(id, shard) {
  return this._request('PUT', '/frames/' + id, shard);
};

/**
 * Stores a file in the bucket
 * @param {String} id - Unique bucket ID
 * @param {String} token - Token from {@link Client#createToken}
 * @param {String} file - Path to file to store
 * @param {Number} shards - Number of shards to create
 * @returns {Promise}
 */
Client.prototype.storeFileInBucket = function(id, token, file) {
  var self = this;
  var numShards = Math.ceil(
    fs.statSync(file).size / storj.FileDemuxer.DEFAULTS.shardSize
  );
  var completed = 0;

  return new Promise(function(resolve, reject) {
    self.createFileStagingFrame().then(function(frame) {
      var demuxer = new storj.FileDemuxer(file);

      demuxer.on('shard', function(shardStream, index) {
        var tmpName = path.join(tmpdir, crypto.randomBytes(6).toString('hex'));
        var tmpFile = fs.createWriteStream(tmpName);
        var hasher = crypto.createHash('sha256');
        var size = 0;

        shardStream.on('data', function(data) {
          size += data.length;
          hasher.update(data);
          tmpFile.write(data);
        });

        shardStream.on('end', function(data) {
          tmpFile.end();
        });

        tmpFile.on('finish', function() {
          var hash = storj.utils.rmd160(hasher.digest('hex'));
          var auditGenerator = new storj.AuditStream(3);
          var shardFile = fs.createReadStream(tmpName);

          shardFile.pipe(auditGenerator).on('finish', function() {
            var challenges = auditGenerator.getPrivateRecord().challenges;
            var tree = auditGenerator.getPublicRecord();

            self.addShardToFileStagingFrame(frame.id, {
              hash: hash,
              size: size,
              index: index,
              challenges: challenges,
              tree: tree
            }).then(function(pointer) {
              var shardFile = fs.createReadStream(tmpName);
              var client = new storj.DataChannelClient(
                storj.Contact(pointer.farmer)
              );

              client.on('open', function() {
                var datachannel = client.createWriteStream(
                  pointer.token,
                  pointer.hash
                );

                shardFile.pipe(datachannel).on('finish', function() {
                  completed++;

                  if (completed === numShards) {
                    self._request('POST', '/buckets/' + id + '/files', {
                      frame: frame.id,
                      mimetype: mime.lookup(file),
                      filename: path.basename(file)
                    }).then(resolve, reject);
                  }
                });

              });
            }, reject);
          });
        });
      });
    });
  });
};

/**
 * Retrieves a file pointer from the bucket
 * @param {String} bucket - Unique bucket ID
 * @param {String} token - Token from {@link Client#createToken}
 * @param {String} fileID - The unique file pointer ID
 * @returns {Promise}
 */
Client.prototype.getFilePointer = function(bucket, token, fileID) {
  var self = this;

  return new Promise(function(resolve, reject) {
    request({
      method: 'GET',
      baseUrl: self._options.baseURI,
      uri: '/buckets/' + bucket + '/files/' + fileID,
      headers: {
        'x-token': token
      },
      json: true
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
 * @returns {Promise}
 */
Client.prototype.resolveFileFromPointers = function(pointers) {
  var self = this;
  var opened = 0;
  var size = pointers.reduce(function(a, b) {
    return { size: a.size + b.size };
  }).size;
  var muxer = new storj.FileMuxer({
    shards: pointers.length,
    length: size
  });

  return new Promise(function(resolve) {
    pointers.forEach(function(pointer) {
      var dcx = new storj.DataChannelClient(new storj.Contact(pointer.farmer));

      dcx.on('open', function() {
        muxer.input(dcx.createReadStream(pointer.token, pointer.hash));

        opened++;

        if (opened === pointers.length) {
          resolve(muxer);
        }
      });
    });
  });
};

/**
 * Sends a request to the storj bridge
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

      if (res.statusCode >= 400) {
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
      pass: storj.utils.sha256(this._options.basicauth.password)
    };
  }

  return opts;
};

module.exports = Client;
