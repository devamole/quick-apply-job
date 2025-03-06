const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

/**
 * Introduce un retraso aleatorio para simular comportamiento humano.
 * @param {number} min - Mínimo en ms (default 500)
 * @param {number} max - Máximo en ms (default 1500)
 */
async function randomDelay(min = 500, max = 1500) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  logger.info(`Aplicando retraso aleatorio de ${delay} ms.`);
  await sleep(delay);
}

/**
 * Rota el User-Agent de la página usando una lista de User-Agent.
 * @param {object} page - Instancia de Playwright.
 * @param {Array<string>} userAgents - Lista de User-Agent.
 */
async function rotateUserAgent(page, userAgents = []) {
  if (userAgents.length === 0) return;
  const randomIndex = Math.floor(Math.random() * userAgents.length);
  const userAgent = userAgents[randomIndex];
  await page.setUserAgent(userAgent);
  logger.info(`User-Agent rotado a: ${userAgent}`);
}

module.exports = {
  randomDelay,
  rotateUserAgent
};
