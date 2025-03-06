// src/modules/chatGptModule.js
const axios = require('axios');
const logger = require('../utils/logger');
const { api } = require('../config');

class ChatGptModule {
  constructor() {
    this.apiKey = api.apiKey;
    this.baseUrl = api.baseUrl;
    // Contexto inicial para la sesión: se le da un tono profesional y se establece el contexto del CV
    this.sessionContext = [
      {
        role: 'system',
        content: 'Eres un profesional senior en desarrollo de software con amplia experiencia y respondes de forma profesional, carismática y con tono senior.'
      },
      {
        role: 'system',
        content: 'Tu hoja de vida incluye experiencia en JavaScript, Node.js, React, Angular, Java, Spring Boot, NestJs y ExpressJs. Tienes más de 5 años de experiencia y respondes de forma concisa y precisa.'
      }
    ];
  }

  /**
   * Envía un prompt a la API de ChatGPT y retorna la respuesta generada.
   * @param {string} prompt - Texto que se enviará a la API.
   * @returns {Promise<string>} Respuesta generada por ChatGPT.
   */
  async generateResponse(prompt) {
    try {
      // Agrega el mensaje del usuario al contexto
      const messages = [...this.sessionContext, { role: 'user', content: prompt }];
      const response = await axios.post(
        `${this.baseUrl}/completions`,
        {
          model: 'text-davinci-003',
          prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
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

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const answer = response.data.choices[0].text.trim();
        logger.info('Respuesta generada por ChatGPT obtenida.');
        return answer;
      } else {
        throw new Error('Respuesta no válida de la API de ChatGPT.');
      }
    } catch (err) {
      logger.error('Error al generar respuesta desde ChatGPT: ' + err.message);
      throw err;
    }
  }
}

module.exports = ChatGptModule;
