'use strict';

const Phase11Review = require('../lib/phase11-review.js');

module.exports = async function handler(req, res) {
  return Phase11Review.handle(req, res);
};
