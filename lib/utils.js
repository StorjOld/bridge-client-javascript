/**
 * @module utils
 */

'use strict';

const DataURI = require('datauri');

/**
 * Converts the given buffer into a data URI
 * @param {Buffer} data
 * @param {String} type
 */
module.exports.toDataURI = function(data, type) {
  var datauri = new DataURI();

  return datauri.format(type || '.txt', data).content;
};
