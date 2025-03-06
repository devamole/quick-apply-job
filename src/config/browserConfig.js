// config/browserConfig.js
// Configuración para el navegador controlado (Puppeteer o Playwright)

module.exports = {
    browser: {
      headless: process.env.BROWSER_HEADLESS !== 'false', // Por defecto en modo headless, se puede desactivar poniendo 'false'
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.85 Safari/537.36',
      slowMo: parseInt(process.env.BROWSER_SLOW_MO, 10) || 50, // Tiempo de retardo para simular interacción humana
      defaultTimeout: parseInt(process.env.BROWSER_DEFAULT_TIMEOUT, 10) || 30000,
      // Si se requiere, se puede incluir configuración para proxies, etc.
    }
  };
  