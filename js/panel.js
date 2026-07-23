/* ==========================================================================
   panel.js
   Lógica del panel lateral estilo SPC: edición de textos (ya manejada por
   contenteditable directamente en el HTML), swatches de color de la tabla
   "Most Probable Peak Intensity", y botón para agregar campos a
   "Fields Plotted".
   ========================================================================== */

const SpcPanel = (function () {

  function init() {
    document.querySelectorAll('.pi-swatch').forEach(function (swatch) {
      swatch.addEventListener('click', function () {
        StyleEditor.showForSwatch(swatch);
      });
    });

    const addFieldBtn = document.getElementById('btnAddField');
    if (addFieldBtn) {
      addFieldBtn.addEventListener('click', function () {
        const li = document.createElement('li');
        li.className = 'editable';
        li.setAttribute('contenteditable', 'true');
        li.textContent = 'Nuevo campo';
        document.getElementById('fieldsPlottedList').appendChild(li);
        li.focus();
      });
    }
  }

  return { init };
})();
