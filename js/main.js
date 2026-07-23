/* ==========================================================================
   main.js
   Punto de entrada: inicializa el mapa Leaflet principal, conecta la
   toolbar con DrawTools, inicializa panel SPC, mini mapa y exportación.
   ========================================================================== */

(function () {

  let map;
  let currentBaseLayer = null;
  let currentBaseKey = 'cartopy_dark';

  // Centro aproximado de Argentina (zona centro-norte, área común de eventos convectivos severos)
  const ARG_CENTER = [-34.0, -63.5];
  const ARG_ZOOM = 6;

  function initMap() {
    map = L.map('map', {
      center: ARG_CENTER,
      zoom: ARG_ZOOM,
      minZoom: 3,
      maxZoom: 14,
      zoomControl: true,
      worldCopyJump: false
    });

    setBaseLayer(currentBaseKey);

    BoundariesLayer.init(map).then(function (res) {
      BoundariesLayer.setDarkMode(BASEMAPS[currentBaseKey].isDark);
      // Encuadrar automáticamente todo el territorio argentino al iniciar
      if (res && res.provinciasLayer) {
        map.fitBounds(res.provinciasLayer.getBounds(), { padding: [10, 10] });
      }
    });

    DrawTools.init(map);
    MiniMap.init(map);
    RoadsLayer.init(map); // se carga en memoria pero permanece oculta hasta activarla en la toolbar

    window.__mcdMap = map; // debug/testing hook
  }

  function setBaseLayer(key) {
    if (currentBaseLayer) {
      map.removeLayer(currentBaseLayer);
      currentBaseLayer = null;
    }
    const def = BASEMAPS[key];
    currentBaseLayer = def.tile();
    currentBaseLayer.addTo(map);
    currentBaseKey = key;
    applyBasemapBackground(document.getElementById('map'), key);
    BoundariesLayer.setDarkMode(def.isDark);
  }

  function wireToolbar() {
    document.getElementById('baseLayerSelect').addEventListener('change', function (e) {
      setBaseLayer(e.target.value);
    });

    document.getElementById('toggleProvincias').addEventListener('change', function (e) {
      BoundariesLayer.setProvinciasVisible(e.target.checked);
    });
    document.getElementById('toggleDepartamentos').addEventListener('change', function (e) {
      BoundariesLayer.setDepartamentosVisible(e.target.checked);
    });

    const toggleRutas = document.getElementById('toggleRutas');
    const roadsColorControls = document.getElementById('roadsColorControls');
    toggleRutas.addEventListener('change', function (e) {
      RoadsLayer.setVisible(e.target.checked);
      roadsColorControls.classList.toggle('hidden', !e.target.checked);
    });
    document.getElementById('roadColorInput').addEventListener('input', function (e) {
      RoadsLayer.setRoadColor(e.target.value);
    });
    document.getElementById('roadCasingColorInput').addEventListener('input', function (e) {
      RoadsLayer.setCasingColor(e.target.value);
    });

    document.getElementById('btnLoadMetar').addEventListener('click', function () {
      const btn = this;
      const originalText = btn.textContent;
      btn.textContent = 'Cargando...';
      btn.disabled = true;
      MetarLayer.load(map).then(function (count) {
        btn.textContent = originalText;
        btn.disabled = false;
        if (!count) {
          alert('No se encontraron observaciones para mostrar en este momento.');
        }
      }).catch(function (err) {
        console.error('Error cargando METAR/SMN:', err);
        btn.textContent = originalText;
        btn.disabled = false;
        alert('No se pudieron cargar las observaciones del SMN. Puede ser un problema temporal de conexión con el servicio del SMN — probá de nuevo en unos segundos.');
      });
    });
    document.getElementById('btnClearMetar').addEventListener('click', function () {
      MetarLayer.clear();
    });

    document.querySelectorAll('.tb-btn[data-tool]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tool = btn.getAttribute('data-tool');
        const isActive = btn.classList.contains('active');
        DrawTools.setTool(isActive ? null : tool);
      });
    });

    document.getElementById('btnSelect').addEventListener('click', function () {
      DrawTools.setTool(null);
    });

    document.getElementById('btnDelete').addEventListener('click', function () {
      if (FloatingBoxes.getSelected()) {
        FloatingBoxes.remove(FloatingBoxes.getSelected());
        StyleEditor.hide();
      } else {
        DrawTools.deleteSelected();
      }
    });

    document.getElementById('btnClearAll').addEventListener('click', function () {
      if (!confirm('¿Seguro que quieres borrar todos los elementos dibujados?')) return;
      DrawTools.clearAll();
    });
  }

  function wireGlobalDeselect() {
    document.getElementById('map-wrapper').addEventListener('mousedown', function (e) {
      // clicking on the raw map background (not a floating box) deselects boxes
      if (!e.target.closest('.floating-textbox')) {
        FloatingBoxes.deselectAll();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initMap();
    wireToolbar();
    SpcPanel.init();
    PanelTheme.init();
    FloatingBoxes.init(document.getElementById('map-wrapper'));
    ExportTool.init();
    wireGlobalDeselect();
  });

})();
