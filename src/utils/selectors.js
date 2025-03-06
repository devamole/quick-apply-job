// src/utils/selectors.js

/**
 * Genera una ruta XPath para un elemento que contenga exactamente el texto dado.
 * @param {string} tag - Etiqueta HTML (default '*').
 * @param {string} text - Texto exacto.
 */
function xpathContainsText(tag = '*', text) {
  return `//${tag}[normalize-space(text())="${text}"]`;
}

/**
 * Genera una ruta XPath para un elemento que contenga parcialmente el texto.
 * @param {string} tag - Etiqueta HTML (default '*').
 * @param {string} text - Texto parcial.
 */
function xpathContainsPartialText(tag = '*', text) {
  return `//${tag}[contains(normalize-space(text()),"${text}")]`
}

/**
 * Retorna un selector CSS basado en una clase.
 * @param {string} className - Nombre de la clase.
 */
function robustSelectorByClass(className) {
  return `.${className}`;
}

module.exports = {
  xpathContainsText,
  xpathContainsPartialText,
  robustSelectorByClass
};
