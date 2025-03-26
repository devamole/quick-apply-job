// src/modules/flowController.js
const logger = require('../utils/logger'); // Logger basado en Winston
const JobListModule = require('./jobListModule');
const JobDetailsModule = require('./jobDetailsModule');
const QuickApplyModule = require('./quickApplyModule');
const DeepseekModule = require('./deepseekModule');
const { sleep, retry } = require('../utils/helpers');

class FlowController {
  constructor(page) {
    this.page = page;
    this.jobListModule = new JobListModule(page);
    this.jobDetailsModule = new JobDetailsModule(page);
    this.quickApplyModule = new QuickApplyModule(page);
    this.gptModule = new DeepseekModule();
  }

  async startFlow(searchUrl) {
    logger.info("=== INICIO DEL FLUJO DE BÚSQUEDA DE VACANTES ===");
    try {
      logger.info(`Navegando a la URL de búsqueda: ${searchUrl}`);
      await this.jobListModule.loadJobList(searchUrl);

      // Ejecutar lazy loading para cargar todas las vacantes
      await this.jobListModule.loadAllJobs();

      logger.info("Buscando vacantes disponibles...");
      const jobs = await this.jobListModule.getJobs();
      logger.info(`Total de vacantes encontradas: ${jobs.length}`);

      for (const job of jobs) {
        logger.info("--------------------------------------------------");
        logger.info(`Abriendo vacante: ${job.display} (ID: ${job.jobId})`);
        if (!job.quickApply) {
          logger.info(`Vacante "${job.display}" no es de Quick Apply. Se omite.`);
          continue;
        }
        await retry(async () => {
          const jobSelector = `li[data-occludable-job-id="${job.jobId}"]`;
          logger.info(`Haciendo click en la vacante usando selector: ${jobSelector}`);
          await this.page.click(jobSelector);
          logger.info("Esperando a que se cargue el detalle de la vacante...");
          await this.page.waitForSelector('.jobs-search__job-details--wrapper', { timeout: 15000 });

          const available = await this.jobDetailsModule.isQuickApplyAvailable();
          if (!available) {
            logger.info(`Vacante "${job.display}" no dispone de Quick Apply. Se omite.`);
            return;
          }

          logger.info("Abriendo modal de Quick Apply...");
          const modalOpened = await this.quickApplyModule.openQuickApplyModal();
          if (!modalOpened) {
            logger.info("El modal no pudo abrirse. Pasando a la siguiente vacante.");
            return;
          }
          logger.info("Modal abierto. Iniciando llenado del formulario multi-step...");
          await this.fillModalForm();

          // Asegurarse de que no quede ningún modal abierto antes de continuar
          await this.ensureNoModalOpen();
        }, 3, 3000);

        logger.info("Vacante procesada. Esperando 2 segundos antes de continuar con la siguiente vacante...");
        await sleep(2000);
      }
      logger.info("=== FINALIZO EL PROCESO DE BÚSQUEDA DE VACANTES ===");
    } catch (err) {
      logger.error("Error en FlowController: " + err.message);
      throw err;
    }
  }

  async fillModalForm() {
    logger.info("=== INICIO DEL LLENADO MULTI-STEP DEL FORMULARIO ===");
    let stepCount = 0;
    const maxSteps = 15;
    let previousStepType = null;
    let sameStepCount = 0;
    const modalSelector = '[data-test-modal-id="easy-apply-modal"]';
    const isModalPresent = await this.page.$(modalSelector) !== null;
    if (!isModalPresent) {
      logger.warn("No se detectó el formulario de Easy Apply. Saliendo del proceso.");
      return;
    } else {
      logger.info("Se detectó el modal de Easy Apply.");
    }
  
    while (stepCount < maxSteps) {
      const stepType = await this.detectStep();
      logger.info(`[Step ${stepCount + 1}] Tipo detectado: ${stepType}`);
  
      if (previousStepType && stepType === previousStepType) {
        sameStepCount++;
        logger.info(`El mismo step se ha detectado ${sameStepCount} veces consecutivas.`);
      } else {
        sameStepCount = 0;
      }
      previousStepType = stepType;
  
      if (sameStepCount >= 3) {
        logger.warn("El mismo step se ha repetido 3 veces consecutivas. Se asume bloqueo. Cerrando modal...");
        await this.closeConfirmationModal();
        break;
      }
  
      const modalStillPresent = await this.page.$(modalSelector) !== null;
      if (!modalStillPresent) {
        logger.info("El modal se ha cerrado inesperadamente. Finalizando llenado del formulario.");
        break;
      }
  
      if (stepType === 'MODAL_CLOSED') {
        logger.info("El modal se ha cerrado inesperadamente. Finalizando llenado del formulario.");
        break;
      } else if (stepType === 'CONTACT_INFO') {
        logger.info("Step 'Contact Info' detectado; pulsando 'Siguiente'.");
        await this.clickNextAndWaitForChange();
      } else if (stepType === 'CURRICULUM') {
        logger.info("Step 'Currículum' detectado; no se requiere acción. Pulsando 'Siguiente'.");
        await this.clickNextAndWaitForChange();
      } else if (stepType === 'RESUME') {
        logger.info("Step 'Resume' detectado; se omite y se hace clic en 'Siguiente'.");
        await this.clickNextAndWaitForChange();
      } else if (stepType === 'FAVORITE') {
        logger.info("Step 'Marcar como favorita' detectado; se omite y se hace clic en 'Siguiente'.");
        await this.clickNextAndWaitForChange();
      } else if (stepType === 'REVIEW' || stepType === 'FINAL') {
        logger.info("Step final 'Revisar tu solicitud' detectado; se procede a enviar la postulación.");
        await this.submitApplication();
        await this.closeConfirmationModal();
        logger.info("Solicitud enviada y modal de confirmación cerrado. Terminando multi-step.");
        break;
      } else if (stepType === 'REGULAR') {
        logger.info("Step 'Regular' detectado. Se procederá a rellenar los campos.");
        await this.fillCurrentStepFields();
        logger.info("Campos completados. Intentando avanzar al siguiente step.");
        await this.clickNextAndWaitForChange();
      } else {
        logger.warn("No se detecta un step definido (DONE). Finalizando llenado del formulario.");
        break;
      }
  
      await this.page.waitForTimeout(1000);
      stepCount++;
    }
    logger.info("=== FINALIZÓ EL PROCESO MULTI-STEP PARA ESTA VACANTE ===");
  }
  

  async detectStep() {
    const modalStillOpen = await this.page.$('.jobs-easy-apply-modal');
    if (!modalStillOpen) return 'MODAL_CLOSED';
  
    try {
      await this.page.waitForSelector('form', { timeout: 5000 });
    } catch (_) {
      if (!modalStillOpen) return 'MODAL_CLOSED';
      return 'DONE';
    }
  
    // Nueva condición: detectar "Información de contacto" (CONTACT_INFO)
    const isContactInfoStep = await this.page.evaluate(() => {
      const xpath = `//div[@data-test-modal and @role="dialog"]//form//h3[normalize-space(.)="Información de contacto"]`;
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue ? true : false;
    });
    if (isContactInfoStep) return 'CONTACT_INFO';
  
    // Nueva condición: detectar "Currículum" usando XPath
    const isCurriculumStep = await this.page.evaluate(() => {
      const xpathSelector = `//div[@data-test-modal and @role="dialog"]//form//h3[normalize-space(.)="Currículum"]`;
      const result = document.evaluate(xpathSelector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue ? true : false;
    });
    if (isCurriculumStep) return 'CURRICULUM';
  
    // Si aparece el botón de envío final, se asume el paso FINAL
    const submitButton = await this.page.$('button[data-live-test-easy-apply-submit-button]');
    if (submitButton) return 'FINAL';
  
    const isResumeStep = await this.page.evaluate(() => {
      const heading = document.querySelector('form h3');
      return heading && heading.innerText.trim().toLowerCase().includes('resume');
    });
    if (isResumeStep) return 'RESUME';
  
    const isFavoriteStep = await this.page.evaluate(() => {
      const heading = document.querySelector('form h4');
      return heading && heading.innerText.trim().toLowerCase().includes('favorita');
    });
    if (isFavoriteStep) return 'FAVORITE';
  
    const hasEmptyFields = await this.page.$$eval('div.artdeco-text-input--container', (containers) => {
      return containers.some(container => {
        const labelElement = container.querySelector('label.artdeco-text-input--label');
        const inputElement = container.querySelector('input.artdeco-text-input--input');
        return labelElement && inputElement && inputElement.value.trim() === '';
      });
    });
    if (hasEmptyFields) return 'REGULAR';
  
    return 'DONE';
  }
  

  async clickNextAndWaitForChange() {
    const formElement = await this.page.$('form');
    if (!formElement) return;
    const formContentBefore = await formElement.innerHTML();
    try {
      logger.info("Intentando hacer clic en el botón 'Siguiente' o 'Revisar' dentro del modal...");
      await this.clickNextOrReviewButton();
      await this.page.waitForFunction(
        (prevContent) => {
          const form = document.querySelector('form');
          return form && form.innerHTML !== prevContent;
        },
        { timeout: 10000 },
        formContentBefore
      );
      logger.info("El contenido del formulario cambió tras hacer clic en 'Siguiente'.");
    } catch (err) {
      logger.warn("No se detectó cambio en el formulario tras hacer clic en 'Siguiente': " + err.message);
    }
  }

  async clickNextOrReviewButton() {
    try {
      const advanceButtonSelector = 'button[data-live-test-easy-apply-review-button], button[data-easy-apply-next-button]';
      logger.info(`Buscando botón de avance usando el selector: ${advanceButtonSelector}`);
      await this.page.waitForSelector(advanceButtonSelector, { timeout: 10000 });
      const advanceButton = await this.page.$(advanceButtonSelector);
      if (advanceButton) {
        logger.info("Desplazando el botón de avance dentro del modal al centro del viewport...");
        await this.page.evaluate((selector) => {
          const button = document.querySelector(selector);
          if (button) {
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, advanceButtonSelector);
        logger.info("Haciendo clic en el botón de avance...");
        await advanceButton.click();
      } else {
        throw new Error('Botón de avance no encontrado en el modal.');
      }
    } catch (err) {
      logger.error("Error al hacer clic en 'Revisar' o 'Siguiente': " + err.message);
      throw err;
    }
  }

  async submitApplication() {
    try {
      const submitButtonSelector = 'button[data-live-test-easy-apply-submit-button]';
      logger.info(`Buscando botón de envío usando el selector: ${submitButtonSelector}`);
      await this.page.waitForSelector(submitButtonSelector, { timeout: 10000 });
      const submitButton = await this.page.$(submitButtonSelector);
      if (submitButton) {
        logger.info("Desplazando el botón de envío dentro del modal al centro del viewport...");
        await this.page.evaluate((selector) => {
          const btn = document.querySelector(selector);
          if (btn) {
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, submitButtonSelector);
        logger.info("Haciendo clic en el botón de envío...");
        await submitButton.click();
      } else {
        throw new Error('Botón de envío no encontrado en el modal.');
      }
    } catch (err) {
      logger.error("Error al enviar la solicitud: " + err.message);
      throw err;
    }
  }

  async closeConfirmationModal() {
    try {
      logger.info("Esperando a que aparezca el botón 'Descartar' en el modal de confirmación...");
      await this.page.waitForSelector('button[aria-label="Descartar"]', { timeout: 10000 });
      const closeButton = await this.page.$('button[aria-label="Descartar"]');
      
      if (closeButton) {
        logger.info("Desplazando el botón 'Descartar' dentro del modal al centro del viewport...");
        await this.page.evaluate(() => {
          const btn = document.querySelector('button[aria-label="Descartar"]');
          if (btn) {
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
        logger.info("Haciendo clic en el botón 'Descartar' para cerrar el modal de confirmación...");
        await closeButton.click();
      }
      logger.info("Esperando a que el modal se cierre completamente...");
      await this.page.waitForSelector('.jobs-easy-apply-modal', { state: 'detached', timeout: 10000 });
      logger.info("Modal de confirmación cerrado.");
    } catch (err) {
      logger.warn("No se pudo cerrar el modal de confirmación: " + err.message);
      throw err;
    }
  }

async fillCurrentStepFields() {
  // Extraer campos de texto (se ignoran selects y radios)
  const textFields = await this.page.$$eval('div.artdeco-text-input--container', containers => {
    return containers.map(container => {
      const labelElement = container.querySelector('label.artdeco-text-input--label');
      const inputElement = container.querySelector('input[type="text"]');
      if (labelElement && inputElement && inputElement.value.trim() === '') {
        return {
          label: labelElement.innerText.trim(),
          elementId: inputElement.getAttribute('id')
        };
      }
      return null;
    }).filter(item => item !== null);
  });
  logger.info(`Se encontraron ${textFields.length} campos de texto para llenar en este step.`);

  // Procesar cada campo de texto
  for (const field of textFields) {
    logger.info(`[Text] Procesando campo: "${field.label}"`);
    let attempts = 0;
    const maxAttempts = 3;
    let success = false;
    let answer = "";
    const inputSelector = `#${field.elementId}`;
    // Definir el selector para el mensaje de error (asumimos que es el mismo id con "-error")
    const errorSelector = `#${field.elementId}-error .artdeco-inline-feedback__message`;

    // Intentar obtener la validación antes de enviar la respuesta
    while (attempts < maxAttempts && !success) {
      attempts++;
      logger.info(`[Text] Intento ${attempts} para el campo "${field.label}"`);

      // Realizar un falso llenado para provocar el mensaje de error
      logger.info(`[Text] Realizando falso llenado con "a" para provocar mensaje de error...`);
      await this.page.waitForSelector(inputSelector, { timeout: 5000 });
      await this.page.evaluate((selector) => {
        const input = document.querySelector(selector);
        if (input) input.value = '';
      }, inputSelector);
      await this.page.focus(inputSelector);
      await this.page.type(inputSelector, "a", { delay: 50 });
      // Esperar brevemente para que aparezca el mensaje de error, si corresponde
      await this.page.waitForTimeout(500);

      // Intentar capturar el mensaje de error
      let errorText = "";
      try {
        errorText = await this.page.$eval(errorSelector, el => el.textContent.trim());
        logger.info(`[Text] Mensaje de error detectado: "${errorText}"`);
      } catch (e) {
        logger.info(`[Text] No se detectó mensaje de error tras el falso llenado.`);
      }

      // Construir el prompt: si hay error, incluir las restricciones; si no, prompt normal
      let prompt = "";
      if (errorText) {
        prompt = `${field.label}. Restricciones: ${errorText}. Por favor, responde únicamente con un valor que cumpla estas condiciones.`;
      } else {
        prompt = field.label;
      }
      logger.info(`[Text] Enviando prompt a Deepseek: "${prompt}"`);
      try {
        answer = await this.gptModule.generateResponse(prompt);
        answer = answer.trim();
        logger.info(`[Text] Respuesta generada: "${answer}"`);
      } catch (err) {
        logger.error(`[Text] Error generando respuesta para "${field.label}": ${err.message}`);
        answer = ".";
      }

      // Llenar el campo con la respuesta generada
      await this.page.evaluate((selector) => {
        const input = document.querySelector(selector);
        if (input) input.value = '';
      }, inputSelector);
      await this.page.focus(inputSelector);
      await this.page.type(inputSelector, answer, { delay: 50 });
      logger.info(`[Text] Campo "${field.label}" completado con: "${answer}"`);

      // Esperar para ver si el mensaje de error desaparece
      await this.page.waitForTimeout(500);
      let errorStillPresent = false;
      try {
        errorStillPresent = await this.page.$(errorSelector) !== null;
      } catch (e) {
        errorStillPresent = false;
      }
      if (errorStillPresent) {
        // Si el error sigue, se reinicia el ciclo de reintentos
        logger.warn(`[Text] El mensaje de error sigue presente en el campo "${field.label}". Se reintentará.`);
      } else {
        success = true;
      }
    }

    if (!success) {
      // Si después de varios intentos el error persiste, se cierra el modal y se sale del llenado
      logger.error(`[Text] No se pudo obtener una respuesta válida para el campo "${field.label}" tras ${maxAttempts} intentos. Cerrando modal y pasando a la siguiente vacante.`);
      await this.closeConfirmationModal();
      return;
    }
    await this.page.waitForTimeout(300);
  }
}


  async ensureNoModalOpen()  {
    try {
      logger.info("Verificando que no quede ningún modal abierto antes de continuar...");
      await this.page.waitForSelector('.jobs-easy-apply-modal', { state: 'detached', timeout: 10000 });
      logger.info("No se detectaron modales abiertos.");
    } catch (err) {
      logger.warn("Se detectó un modal abierto. Intentando forzar su cierre...");
      const closeButton = await this.page.$('button[aria-label="Descartar"]');
      if (closeButton) {
        await closeButton.click();
        await this.page.waitForSelector('.jobs-easy-apply-modal', { state: 'detached', timeout: 10000 });
        logger.info("Modal forzado cerrado.");
      } else {
        logger.warn("No se pudo forzar el cierre del modal.");
      }
    }
  }
}

module.exports = FlowController;
