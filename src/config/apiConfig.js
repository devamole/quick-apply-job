// src/config/apiConfig.js
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

if (!OPENAI_API_KEY) {
  throw new Error('La variable de entorno OPENAI_API_KEY no está definida.');
}

module.exports = {
  openai: {
    apiKey: OPENAI_API_KEY,
    baseUrl: OPENAI_BASE_URL
  }
};
