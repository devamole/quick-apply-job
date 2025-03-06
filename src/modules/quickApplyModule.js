// src/modules/quickApplyModule.js
const logger = require('../utils/logger');

class QuickApplyModule {
  /**
   * @param {object} page - Instancia de Playwright.
   */
  constructor(page) {
    this.page = page;
  }

  /**
   * Intenta hacer clic en el botón "Solicitud sencilla" y abrir el modal.
   * Retorna true si lo abre, false si no se encuentra el botón o falla.
   */
  async openQuickApplyModal() {
    try {
      const buttonSelector = 'button.jobs-apply-button';
      // Espera a que el botón esté presente y visible
      await this.page.waitForSelector(buttonSelector, { timeout: 15000, state: 'visible' });
      // Utiliza directamente page.click() para que se re-localice el elemento
      await this.page.click(buttonSelector);
      logger.info('Botón "Solicitud sencilla" clickeado, esperando apertura del modal...');
      await this.page.waitForSelector('.jobs-easy-apply-modal', { timeout: 15000 });
      logger.info('Modal de "Solicitud sencilla" abierto.');
      return true;
    } catch (err) {
      logger.error('Error al abrir el modal de Quick Apply: ' + err.message);
      return false;
    }
  }
}

module.exports = QuickApplyModule;
