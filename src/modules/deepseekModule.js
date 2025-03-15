const axios = require('axios');
const logger = require('../utils/logger');
const { api } = require('../config');

class DeepSeekModule {
  constructor() {
    this.apiKey = api.deepseekApiKey;
    this.baseUrl = api.deepseekBaseUrl;
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

  async generateResponse(prompt, retries = this.maxRetries) {
    logger.info("Generando respuesta de DeepSeek...");

    // Si ya hay una solicitud en proceso, espera antes de continuar
    while (this.isProcessing) {
      logger.warn("Solicitud en proceso. Esperando...");
      await new Promise(res => setTimeout(res, 5000));
    }

    this.isProcessing = true;

    try {
      // Agrega el mensaje del usuario al contexto
      this.sessionContext.push({ role: 'user', content: prompt });

      // Mantener el historial de mensajes corto para no consumir demasiados tokens
      if (this.sessionContext.length > 5) this.sessionContext.shift();

      logger.info("Enviando solicitud a DeepSeek...");

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: 'deepseek-chat',
          messages: this.sessionContext,
          max_tokens: 150,
          temperature: 1.3
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
        logger.info("Respuesta obtenida de DeepSeek.");
        return answer;
      } else {
        throw new Error("Respuesta no válida de la API de DeepSeek.");
      }
    } catch (err) {
      // Si hay demasiadas solicitudes (429), espera y reintenta
      if (err.response?.status === 429 && retries > 0) {
        const waitTime = Math.min((this.maxRetries - retries + 1) * 5000, 50000);
        logger.warn(`Demasiadas solicitudes. Esperando ${waitTime / 1000} segundos antes de reintentar...`);
        await new Promise(res => setTimeout(res, waitTime));
        return this.generateResponse(prompt, retries - 1);
      }

      logger.error("Error al generar respuesta desde DeepSeek: " + err.message);
      throw err;
    } finally {
      this.isProcessing = false; // Liberar el control de flujo
    }
  }
}

module.exports = DeepSeekModule;
