// src/utils/helpers.js

/**
 * Retorna una promesa que se resuelve después de ms milisegundos.
 * @param {number} ms - Milisegundos a esperar.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Espera hasta que la función de condición retorne true.
 * @param {Function} conditionFn - Función que retorna un boolean o una promesa de boolean.
 * @param {number} interval - Intervalo en ms.
 * @param {number} timeout - Tiempo máximo en ms.
 */
async function waitForCondition(conditionFn, interval = 100, timeout = 30000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const checkCondition = async () => {
      try {
        const result = await conditionFn();
        if (result) return resolve();
        if (Date.now() - startTime > timeout) return reject(new Error('Timeout waiting for condition'));
        setTimeout(checkCondition, interval);
      } catch (error) {
        reject(error);
      }
    };
    checkCondition();
  });
}

/**
 * Reintenta la ejecución de una función que retorna una promesa.
 * @param {Function} fn - Función que retorna una promesa.
 * @param {number} retries - Número de reintentos.
 * @param {number} delay - Tiempo en ms entre reintentos.
 */
async function retry(fn, retries = 3, delay = 1000) {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      await sleep(delay);
      return retry(fn, retries - 1, delay);
    }
    throw error;
  }
}

module.exports = {
  sleep,
  waitForCondition,
  retry
};
