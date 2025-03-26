// src/config/apiConfig.js

// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_API_KEY = process.env.DEEP_SEEK_API_KEY;

if (!DEEPSEEK_API_KEY) {
  throw new Error('La variable de entorno DEEPSEEK_API_KEY no está definida.');
}

module.exports = {
  // openai: {
  //   apiKey: OPENAI_API_KEY,
  //   baseUrl: OPENAI_BASE_URL
  // },
  deepseek:{
    apiKey: DEEPSEEK_API_KEY,
    baseUrl: DEEPSEEK_BASE_URL
  }
};
