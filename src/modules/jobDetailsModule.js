// src/modules/jobDetailsModule.js
const logger = require('../utils/logger');

class JobDetailsModule {
  /**
   * @param {object} page - Instancia de Playwright.
   */
  constructor(page) {
    this.page = page;
  }

  /**
   * Abre el detalle de la vacante haciendo clic en el elemento.
   * @param {string} jobSelector - Selector único del elemento de la vacante.
   */
  async openJobDetails(jobSelector) {
    try {
      await this.page.click(jobSelector);
      await this.page.waitForSelector('.jobs-search__job-details--wrapper', { timeout: 15000 });
      logger.info('Detalle de vacante cargado correctamente.');
    } catch (err) {
      logger.error('Error al abrir el detalle de la vacante: ' + err.message);
      throw err;
    }
  }

  /**
   * Verifica si la opción "Solicitud sencilla" está disponible en el panel de detalles.
   * @returns {Promise<boolean>}
   */
  async isQuickApplyAvailable() {
    try {
      const quickApplyButton = await this.page.$('button.jobs-apply-button');
      return quickApplyButton !== null;
    } catch (err) {
      logger.error('Error al comprobar disponibilidad de Quick Apply: ' + err.message);
      throw err;
    }
  }
}

module.exports = JobDetailsModule;
