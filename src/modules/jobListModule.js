// src/modules/jobListModule.js
const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

class JobListModule {
  /**
   * @param {object} page - Instancia de Playwright.
   */
  constructor(page) {
    this.page = page;
  }

  /**
   * Carga la página de búsqueda de vacantes.
   * @param {string} url - URL de búsqueda de LinkedIn.
   */
  async loadJobList(url) {
    try {
      if (this.page.url() === url) {
        await this.page.reload({ waitUntil: 'networkidle' });
        logger.info('Página recargada, ya que la URL era la misma.');
      } else {
        await this.page.goto(url, { waitUntil: 'networkidle' });
      }
      await this.page.waitForSelector('li.scaffold-layout__list-item', { timeout: 80000 });
      logger.info('Listado de vacantes cargado correctamente.');
    } catch (err) {
      logger.error('Error al cargar el listado de vacantes: ' + err.message);
      throw err;
    }
  }

  /**
   * Extrae el listado de vacantes y filtra aquellas con Quick Apply.
   * En lugar de usar el ID, se crea una cadena con "Empresa - Título".
   * @returns {Promise<Array>} Array de objetos con información básica de cada vacante.
   */
  async getJobs() {
    try {
      const jobs = await this.page.$$eval(
        'li.scaffold-layout__list-item',
        (jobNodes) => {
          return jobNodes.map((job) => {
            const jobCard = job.querySelector('.job-card-container');
            if (!jobCard) return null;

            // Extraer el título del empleo
            const titleElement = jobCard.querySelector('a.job-card-container__link');
            const title = titleElement ? titleElement.innerText.trim() : '';

            // Extraer jobId
            const jobId = job.getAttribute('data-occludable-job-id') || '';

            // Extraer el nombre de la empresa (usando la clase estable para el subtítulo)
            const companyElement = jobCard.querySelector('.artdeco-entity-lockup__subtitle');
            const company = companyElement ? companyElement.innerText.trim() : '';

            // Crear la cadena con "Empresa - Título"
            const display = company && title ? `${company} - ${title}` : title || company;

            // Verificar si el botón de aplicación dice "Solicitud sencilla"
            // let quickApply = false;
            // const applyButton = jobCard.querySelector('button');
            // if (applyButton) {
            //   const btnText = applyButton.innerText.trim().toLowerCase();
            //   if (btnText.includes('Solicitud sencilla')) {
            //     quickApply = true;
            //   }
            // }

            //*****!!IMPORTANTE elimine el quickApply del objeto aquí abajo */
            return { display, jobId };
          }).filter(item => item !== null);
        }
      );
      logger.info(`Se extrajeron ${jobs.length} vacantes.`);
      return jobs;
    } catch (err) {
      logger.error('Error al extraer vacantes: ' + err.message);
      throw err;
    }
  }
}

module.exports = JobListModule;
