'use strict';

var assert = require('assert');
var crypto = require('crypto');
var elliptic = require('elliptic');
var ecdsa = new elliptic.ec(elliptic.curves.secp256k1);

/**
 * Creates a ECDSA key pair instance
 * @constructor
 * @param {String|Buffer} privkey - Hex encoded ECDSA (secp256k1) public key
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
 * @returns {String}
 */
KeyPair.prototype.getPrivateKey = function() {
  return this._keypair.getPrivate().toString('hex');
};

/**
 * Returns the public key
 * @returns {String}
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
 * @returns {String}
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
 * @param {String|Buffer} data - Message to sign
 * @returns {String}
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
 * @param {String|Buffer} data - Message to verify
 * @param {String|Buffer} pubkey - Hex encoded ECDSA (secp256k1) public key
 * @param {String|Buffer} signature - DER signature (hex)
 * @returns {Boolean}
 */
KeyPair.prototype.verify = function(data, pubkey, signature) {
  if (!Buffer.isBuffer(data)) {
   data = new Buffer(data, 'utf8');
  }

  if (!Buffer.isBuffer(signature)) {
   signature = new Buffer(signature, 'hex');
  }

  if (!Buffer.isBuffer(pubkey)) {
   pubkey = ecdsa.keyFromPublic(pubkey, 'hex');
  }

  return ecdsa.verify(
    crypto.createHash('sha256').update(data).digest('hex'),
    signature,
    pubkey
  );
};

module.exports = KeyPair;
