// src/modules/jobListModule.js
const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

class JobListModule {
  /**
   * @param {object} page - Instancia de Playwright.
   */
  constructor(page) {
    this.page = page;
    logger.info("JobListModule inicializado.");
  }

  /**
   * Carga la página de búsqueda de vacantes usando 'domcontentloaded'.
   * @param {string} url - URL de búsqueda de LinkedIn.
   */
  async loadJobList(url) {
    try {
      logger.info(`loadJobList: Navegando a la URL: ${url}`);
      if (this.page.url() === url) {
        logger.info("loadJobList: La URL actual es la misma. Se recargará la página.");
        await this.page.reload({ waitUntil: 'domcontentloaded' });
      } else {
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      }
      logger.info("loadJobList: Esperando a que aparezcan elementos 'li.scaffold-layout__list-item'...");
      await this.page.waitForSelector('li.scaffold-layout__list-item', { timeout: 30000 });
      logger.info("loadJobList: Página cargada correctamente con los elementos de vacantes.");
    } catch (err) {
      logger.error('loadJobList: Error al cargar el listado de vacantes: ' + err.message);
      throw err;
    }
  }

  /**
   * Realiza lazy loading haciendo scroll en la página para cargar más vacantes.
   */
  async loadAllJobs() {
    try {
      logger.info("loadAllJobs: Iniciando lazy loading de vacantes...");
      let previousCount = 0;
      let currentCount = await this.page.$$eval('li.scaffold-layout__list-item', nodes => nodes.length);
      logger.info(`loadAllJobs: Vacantes cargadas inicialmente: ${currentCount}`);

      while (currentCount > previousCount) {
        logger.info(`loadAllJobs: Se encontró que currentCount (${currentCount}) es mayor que previousCount (${previousCount}). Realizando scroll...`);
        previousCount = currentCount;
        await this.page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await sleep(2000); // Espera para que se carguen nuevos elementos
        currentCount = await this.page.$$eval('li.scaffold-layout__list-item', nodes => nodes.length);
        logger.info(`loadAllJobs: Vacantes cargadas tras scroll: ${currentCount}`);
      }
      logger.info("loadAllJobs: Lazy loading completado. No se cargaron más vacantes.");
    } catch (err) {
      logger.error("loadAllJobs: Error durante el lazy loading de vacantes: " + err.message);
      throw err;
    }
  }

  /**
   * Extrae la lista de vacantes y filtra aquellas con Quick Apply.
   * Para cada vacante se extraen:
   * - jobId (usado en otros módulos para construir selectores)
   * - display: cadena en el formato "Empresa - Título"
   * - quickApply: true si alguno de los elementos del footer indica "solicitud sencilla"
   * @returns {Promise<Array>} Array de objetos con la información de cada vacante.
   */
  async getJobs() {
    try {
      logger.info("getJobs: Iniciando extracción de vacantes...");
      const jobs = await this.page.$$eval(
        'li.scaffold-layout__list-item',
        (jobNodes) => {
          return jobNodes.map((job) => {
            const jobCard = job.querySelector('.job-card-container');
            if (!jobCard) return null;

            // Extraer jobId
            const jobId = job.getAttribute('data-occludable-job-id') || '';

            // Extraer el título del empleo
            const titleElement = jobCard.querySelector('a.job-card-container__link');
            const title = titleElement ? titleElement.innerText.trim() : '';

            // Extraer el nombre de la empresa
            const companyElement = jobCard.querySelector('.artdeco-entity-lockup__subtitle');
            const company = companyElement ? companyElement.innerText.trim() : '';

            // Construir la cadena "Empresa - Título"
            const display = company && title ? `${company} - ${title}` : title || company;

            // Determinar si es Quick Apply: buscar en el footer el elemento <li> cuyo contenido sea "solicitud sencilla"
            let quickApply = false;
            const footerItems = jobCard.querySelectorAll('ul.job-card-list__footer-wrapper li.job-card-container__footer-item');
            if (footerItems && footerItems.length) {
              footerItems.forEach((li) => {
                const text = li.textContent.trim().toLowerCase();
                if (text === 'solicitud sencilla') {
                  quickApply = true;
                }
              });
            }
            return { jobId, display, quickApply };
          }).filter(item => item !== null);
        }
      );
      logger.info(`getJobs: Se extrajeron ${jobs.length} vacantes.`);
      return jobs;
    } catch (err) {
      logger.error('getJobs: Error al extraer vacantes: ' + err.message);
      throw err;
    }
  }
}

module.exports = JobListModule;
