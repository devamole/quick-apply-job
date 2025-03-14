// src/modules/flowController.js
const logger = require('../utils/logger'); // Nuestro logger basado en Winston
const JobListModule = require('./jobListModule');
const JobDetailsModule = require('./jobDetailsModule');
const QuickApplyModule = require('./quickApplyModule');
const ChatGptModule = require('./chatGptModule');
const { sleep, retry } = require('../utils/helpers');

class FlowController {
  constructor(page) {
    this.page = page;
    this.jobListModule = new JobListModule(page);
    this.jobDetailsModule = new JobDetailsModule(page);
    this.quickApplyModule = new QuickApplyModule(page);
    this.chatGptModule = new ChatGptModule();
  }

  async startFlow(searchUrl) {
    logger.info("=== INICIO DEL FLUJO DE BÚSQUEDA DE VACANTES ===");
    try {
      logger.info(`Navegando a la URL de búsqueda: ${searchUrl}`);
      await this.jobListModule.loadJobList(searchUrl);
      logger.info("Buscando vacantes disponibles...");
      const jobs = await this.jobListModule.getJobs();
      logger.info(`Total de vacantes encontradas: ${jobs.length}`); 

      for (const job of jobs) {
        logger.info("--------------------------------------------------");
        logger.info(`Abriendo vacante: ${job.display}`);

        await retry(async () => {
          const jobSelector = `li[data-occludable-job-id="${job.jobId}"]`;
          logger.info(`Haciendo click en la vacante usando selector: ${jobSelector}`);
          await this.page.click(jobSelector);
          logger.info("Esperando a que se cargue el detalle de la vacante...");
          await this.page.waitForSelector('.jobs-search__job-details--wrapper', { timeout: 9000 });

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

    // Esperar a que aparezca el modal
    const modalSelector = '[data-test-modal-id="easy-apply-modal"]';
    const isModalPresent = await this.page.$(modalSelector) !== null;
    
    if (!isModalPresent) {
        logger.warn("No se detectó el formulario de Easy Apply. Saliendo del proceso.");
        return;
      }

      if(modalSelector){
        logger.info("El modal se detecto");
      }else{
        logger.info("error al detectar modal");
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
        logger.warn("El mismo step se ha repetido 3 veces. Se asume bloqueo. Cerrando modal...");
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
      } else if( stepType === 'CONTACT_INFO'){
        logger.info("step 'CONTACT_INFO' detectado");
        await this.clickNextAndWaitForChange();
      } else if( stepType === 'CURRICULUM'){
        logger.info("step 'CURRICULUM' detectado");
        await this.clickNextAndWaitForChange();
      }else if (stepType === 'RESUME') {
        logger.info("Step 'Resume' detectado; se omite y se hace clic en 'Siguiente'.");
        await this.clickNextAndWaitForChange();
      } else if (stepType === 'FAVORITE') {
        logger.info("Step 'Marcar como favorita' detectado; se omite y se hace clic en 'Siguiente'.");
        await this.clickNextAndWaitForChange();
      } else if (stepType === 'FINAL') {
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
      }  else {
        logger.warn("No se detecta un step definido. Verificando si el modal sigue abierto...");

        /// reintentar el llenado del formulario antes de que el bot se detenga.

        const modalStillPresentAgain = await this.page.$(modalSelector) !== null;
        if (!modalStillPresentAgain) {
            logger.info("El modal se ha cerrado inesperadamente. Finalizando llenado del formulario.");
            break;
        }

        logger.info("El modal sigue abierto, esperando y reintentando...");
        await this.page.waitForTimeout(1500);
        continue;
    }
      await this.page.waitForTimeout(1000);
      stepCount++;
    }
    logger.info("=== FINALIZÓ EL PROCESO MULTI-STEP PARA ESTA VACANTE ===");
  }

  //----------------------------------------------------------------------------------------------------------------------
  async detectStep() {
    const modalStillOpen = await this.page.$('.jobs-easy-apply-modal');
    if (!modalStillOpen) return 'MODAL_CLOSED';

    try {
      await this.page.waitForSelector('form', { timeout: 5000 });
    } catch (_) {
      if (!modalStillOpen) return 'MODAL_CLOSED';
      return 'DONE';
    }

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

    const contactInfoStep = await this.page.evaluate(() => {
      const heading = document.querySelector('form h3');
      return heading && heading.innerText.trim().toLowerCase().includes('información de contacto');
    });

    if(contactInfoStep) return 'CONTACT_INFO';

    const curriculumStep = await this.page.evaluate(() => {
      const headings = [...document.querySelectorAll('form h3')];
      return headings.some(h3 => h3.innerText.trim().toLowerCase().includes('currículum'));
    });

    if(curriculumStep) return 'CURRICULUM';

    const isSubmitButtonVisible = await this.page.evaluate(()=>{
      const btnSubmit = document.querySelector('button[aria-label="Enviar solicitud"] span').innerText;
      return btnSubmit.trim().toLowerCase().includes('enviar solicitud');
    })

    console.log("-------isSubmitButtonVisible: ", isSubmitButtonVisible);
    
    if (isSubmitButtonVisible) return 'FINAL';

    console.log("-------nada funciono y paso aqui");
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
      logger.info("Esperando a que aparezca el botón 'Ahora no' en el modal de confirmación...");
      await this.page.waitForSelector('button:has-text("Ahora no")', { timeout: 10000 });
      const closeButton = await this.page.$('button:has-text("Ahora no")');
      if (closeButton) {
        logger.info("Desplazando el botón 'Ahora no' dentro del modal al centro del viewport...");
        await this.page.evaluate(() => {
          const btn = document.querySelector('button:has-text("Ahora no")');
          if (btn) {
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
        logger.info("Haciendo clic en el botón 'Ahora no' para cerrar el modal de confirmación...");
        await closeButton.click();
      }
      await this.page.waitForSelector('.jobs-easy-apply-modal', { state: 'detached', timeout: 10000 });
      logger.info("Modal de confirmación cerrado.");
    } catch (err) {
      logger.warn("No se pudo cerrar el modal de confirmación: " + err.message);
    }
  }

  async fillCurrentStepFields() {
    const fields = await this.page.$$eval('div.artdeco-text-input--container', containers => {
      return containers
        .map(container => {
          const labelElement = container.querySelector('label.artdeco-text-input--label');
          const inputElement = container.querySelector('input.artdeco-text-input--input');
          if (labelElement && inputElement && inputElement.value.trim() === '') {
            return {
              label: labelElement.innerText.trim(),
              inputId: inputElement.getAttribute('id')
            };
          }
          return null;
        })
        .filter(item => item !== null);
    });
  
    logger.info(`Se encontraron ${fields.length} campos para llenar en este step.`);
    for (const field of fields) {
      const prompt = field.label;
      logger.info(`[Input] Llenando campo: "${prompt}"`);
      const answer = await this.chatGptModule.generateResponse(prompt);
      logger.info(`[Input] Respuesta generada: ${answer}`);
  
      const inputSelector = `#${field.inputId}`;
      await this.page.waitForSelector(inputSelector, { timeout: 5000 });
      await this.page.evaluate((selector) => {
        const input = document.querySelector(selector);
        if (input) input.value = '';
      }, inputSelector);
      await this.page.focus(inputSelector);
      await this.page.type(inputSelector, answer, { delay: 50 });
      logger.info(`[Input] Campo "${prompt}" completado.`);
      await this.page.waitForTimeout(300);
    }
  }
}

module.exports = FlowController;
