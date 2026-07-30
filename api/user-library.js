'use strict';

const UserLibrary = require('../lib/user-library.js');

module.exports = async function handler(req, res) {
  return UserLibrary.handle(req, res);
};
