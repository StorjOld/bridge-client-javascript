/**
 * @module bridge-client
 */

'use strict';

/**
 * @external storj
 * @see {@link https://github.com/storj/core}
 */
module.exports.__core = require('storj');

/**
 * {@link Client}
 */
module.exports.Client = require('./lib/client');

/**
 * {@link KeyPair}
 */
module.exports.KeyPair = require('./lib/keypair');
