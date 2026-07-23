/* ==========================================================================
   export.js
   Exportación de la discusión completa (panel + mapa + cajas flotantes) a
   una imagen PNG usando html2canvas.
   ========================================================================== */

const ExportTool = (function () {

  function init() {
    const btn = document.getElementById('btnExport');
    if (!btn) return;
    btn.addEventListener('click', doExport);
  }

  function doExport() {
    const target = document.getElementById('main-layout');
    // Leaflet tiles loaded from cross-origin CDNs may taint the canvas;
    // html2canvas with useCORS true handles most tile providers reasonably well.
    html2canvas(target, {
      useCORS: true,
      allowTaint: false,
      scale: 2,
      backgroundColor: '#ffffff'
    }).then(function (canvas) {
      const link = document.createElement('a');
      const mcdNum = document.getElementById('mcdNumber').textContent.trim() || 'MCD';
      link.download = `MCD_${mcdNum}_Argentina.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }).catch(function (err) {
      console.error('Error exportando PNG:', err);
      alert('No se pudo exportar la imagen. Es posible que algún mapa base bloquee la exportación por CORS. Probá con el mapa "Estilo Cartopy" o "Sin mapa base" para exportar sin problemas.');
    });
  }

  return { init };
})();
