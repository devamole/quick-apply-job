// src/modules/chatGptModule.js
const axios = require('axios');
const logger = require('../utils/logger');
const { api } = require('../config');

class ChatGptModule {
  constructor() {
    this.apiKey = api.apiKey;
    this.baseUrl = api.baseUrl;
    this.sessionContext = [];
  }

  async generateResponse(prompt, retries = 3) {
    try {
      // Agrega el mensaje del usuario al contexto
      const messages = [...this.sessionContext, { role: 'user', content: prompt }];

      const response = await axios.post(
        `${this.baseUrl}/v1/chat/completions`,
        {
          model: 'gpt-3.5-turbo',
          messages: messages, // Se mantiene como array, no concatenado
          max_tokens: 150,
          temperature: 0.7
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      if (response.data?.choices?.length > 0) {
        const answer = response.data.choices[0].message.content.trim();
        logger.info('Respuesta generada por ChatGPT obtenida.');
        return answer;
      } else {
        throw new Error('Respuesta no válida de la API de ChatGPT.');
      }

    } catch (err) {
      if (err.response?.status === 429 && retries > 0) {
        const waitTime = (4 - retries) * 2000; // 2s -> 4s -> 6s de espera progresiva
        logger.warn(`Demasiadas solicitudes. Esperando ${waitTime / 1000} segundos antes de reintentar...`);
        await new Promise(res => setTimeout(res, waitTime));
        return this.generateResponse(prompt, retries - 1);
      }

      logger.error('Error al generar respuesta desde ChatGPT: ' + err.message);
      throw err;
    }
  }
}

module.exports = ChatGptModule;
