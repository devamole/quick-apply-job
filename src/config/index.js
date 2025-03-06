
const apiConfig = require('./apiConfig');
const browserConfig = require('./browserConfig');

module.exports = {
  api: apiConfig.openai,
  browser: browserConfig.browser
};
