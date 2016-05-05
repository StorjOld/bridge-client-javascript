/**
 * @module bridge-client
 */

'use strict';

/**
 * @external storj
 * @see {@link https://github.com/storj/core}
 */
module.exports.__core = require('storj');
module.exports.KeyPair = module.exports.__core.KeyPair;

/**
 * {@link Client}
 */
module.exports.Client = require('./lib/client');
