/**
 * @class kad-spartacus/keypair
 */

'use strict';

var assert = require('assert');
var crypto = require('crypto');
var elliptic = require('elliptic');
var ecdsa = new elliptic.ec(elliptic.curves.secp256k1);

/**
 * Creates a spartacus context
 * @constructor
 * @param {String|Buffer} privkey
 */
function KeyPair(privkey) {
  if (!(this instanceof KeyPair)) {
    return new KeyPair(privkey);
  }

  if (privkey) {
    this._keypair = ecdsa.keyFromPrivate(privkey);
  } else {
    this._keypair = ecdsa.genKeyPair();
  }
}

/**
 * Returns the private key
 * #getPrivateKey
 */
KeyPair.prototype.getPrivateKey = function() {
  return this._keypair.getPrivate().toString('hex');
};

/**
 * Returns the public key
 * #getPublicKey
 */
KeyPair.prototype.getPublicKey = function() {
  var pubkey, pubkeyobj = this._keypair.getPublic();
  var xbuf = new Buffer(pubkeyobj.x.toString('hex', 64), 'hex');
  var ybuf = new Buffer(pubkeyobj.y.toString('hex', 64), 'hex');

  if (ybuf[ybuf.length - 1] % 2) {
    pubkey = Buffer.concat([new Buffer([3]), xbuf]);
  } else {
    pubkey = Buffer.concat([new Buffer([2]), xbuf]);
  }

  return pubkey.toString('hex');
};

/**
 * Returns the nodeID
 * #getNodeID
 */
KeyPair.prototype.getNodeID = function() {
  function getNodeIdFromPublicKey(pubkey) {
    if (!Buffer.isBuffer(pubkey)) {
      pubkey = new Buffer(pubkey, 'hex');
    }

    var pubhash = crypto.createHash('sha256').update(pubkey).digest();
    var pubripe = crypto.createHash('rmd160').update(pubhash).digest();

    return pubripe.toString('hex');
  }

  return getNodeIdFromPublicKey(this.getPublicKey());
};

/**
 * Sign a message
 * #_sign
 * @param {String|Buffer} data
 */
KeyPair.prototype.sign = function(data) {
  if (!Buffer.isBuffer(data)) {
    data = new Buffer(data, 'utf8');
  }

  return ecdsa.sign(
    crypto.createHash('sha256').update(data).digest('hex'),
    this.getPrivateKey()
  ).toDER('hex');
};

/**
 * Verify a signature
 * #_verify
 * @param {String|Buffer} data
 * @param {String|Buffer} pubkey
 * @param {String|Buffer} signature - DER signature (hex)
 */
KeyPair.prototype.verify = function(data, pubkey, signature) {
  if (!Buffer.isBuffer(data)) {
   data = new Buffer(data, 'utf8');
  }

  if (!Buffer.isBuffer(signature)) {
   signature = new Buffer(signature, 'hex');
  }

  if (!Buffer.isBuffer(pubkey)) {
   pubkey = new Buffer(pubkey, 'hex');
  }

  return ecdsa.verify(
    crypto.createHash('sha256').update(data).digest('hex'),
    signature,
    pubkey
  );
};

module.exports = KeyPair;
