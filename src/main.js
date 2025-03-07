require('dotenv').config();
const { chromium } = require('playwright');
const { browser: browserConfig } = require('./config/browserConfig'); 
const FlowController = require('./modules/flowController');
const { rotateUserAgent, randomDelay } = require('./modules/antiScraping');
const logger = require('./utils/logger');
const { retry } = require('./utils/helpers');
const { loadCookies, saveCookies, loginIfNeeded } = require('./modules/loginModule');
// Recibir la URL de búsqueda como argumento
const searchUrl = process.env.URL_JOBS;
if (!searchUrl) {
  console.error('Debes proporcionar la URL de búsqueda de LinkedIn como argumento.');
  process.exit(1);
}

(async () => {
  let browser;
  try {
    logger.info(`Iniciando bot con URL: ${searchUrl}`);
    browser = await chromium.launch({ headless: browserConfig.headless, slowMo: browserConfig.slowMo });
    const context = await browser.newContext({
      userAgent: browserConfig.userAgent
    });

    // Carga cookies preguardadas, si existen
    await loadCookies(context);

    var page = await context.newPage();

    // Simula un retraso aleatorio inicial
    await randomDelay();

    await loginIfNeeded(page);

    // Guarda las cookies actualizadas tras el login
    await saveCookies(context);

    // Cierra la página actual (que está en el feed) y crea una nueva para navegar a la búsqueda
    await page.close();
    page = await context.newPage();
    
    const flowController = new FlowController(page);
    await flowController.startFlow(searchUrl);

    logger.info('Proceso de postulación finalizado.')
    await browser.close();
    process.exit(0);
  } catch (err) {
    logger.error('Error en main.js: ' + err.message);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
