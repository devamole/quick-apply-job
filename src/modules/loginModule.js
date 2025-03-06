// src/modules/loginModule.js
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const COOKIE_PATH = path.resolve(__dirname, '../../cookies.json');

/**
 * Carga las cookies guardadas en un archivo y las añade al contexto.
 * @param {object} context - Contexto de Playwright.
 */
async function loadCookies(context) {
  if (fs.existsSync(COOKIE_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf8'));
    await context.addCookies(cookies);
    logger.info('Cookies cargadas desde archivo.');
  } else {
    logger.info('No se encontraron cookies preexistentes.');
  }
}

/**
 * Guarda las cookies del contexto en un archivo.
 * @param {object} context - Contexto de Playwright.
 */
async function saveCookies(context) {
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
  logger.info('Cookies guardadas en archivo.');
}

/**
 * Verifica si el usuario ya está autenticado y, en caso contrario, realiza el login.
 * @param {object} page - Página de Playwright.
 */
async function loginIfNeeded(page) {
  try {
    // Navega al feed para comprobar si el usuario ya está autenticado
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
    // Si aparece el formulario de login, entonces no está autenticado.
    const loginForm = await page.$('form.login__form');
    if (loginForm) {
      logger.info('No autenticado, se procederá a iniciar sesión.'); 
      await performLogin(page);
    } else {
      logger.info('Usuario ya autenticado.');
    }
  } catch (err) { 
    logger.error('Error al verificar autenticación: ' + err.message);
    throw err;
  }
}

/**
 * Realiza el proceso de login en LinkedIn.
 * @param {object} page - Página de Playwright.
 */
async function performLogin(page) {
  // Navega a la página de login
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle' });
  const username = process.env.LINKEDIN_USERNAME;
  const password = process.env.LINKEDIN_PASSWORD;
  if (!username || !password) {
    throw new Error("Credenciales de LinkedIn no definidas en las variables de entorno.");
  }
  await page.fill('input#username', username);
  await page.fill('input#password', password);
  await page.click('button[type="submit"]');
  // Espera a la navegación tras iniciar sesión
   // class=""
  // Verifica si el login fue exitoso, por ejemplo, buscando el ícono de perfil 
  //const profileIcon = await page.$('img.profile-card-profile-picture');
  const profileIcon = await page.waitForSelector('img.profile-card-profile-picture', { timeout: 15000 });

  if (!profileIcon) {
    throw new Error("No se pudo iniciar sesión. Verifica tus credenciales o si se requiere resolver un captcha.");
  }
  logger.info("Inicio de sesión exitoso.");
}

module.exports = { loadCookies, saveCookies, loginIfNeeded };
