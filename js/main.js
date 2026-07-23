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
    RegionMask.init(); // habilita la restricción de área MCD/Contorno a Argentina, Paraguay y Uruguay
    DeptLabels.init(map); // etiquetas de departamentos AR+PY+UY, ocultas por defecto
    WatchTool.init(map); // herramienta de vigilancias por departamento/municipio
    RadarLayer.init(map); // imágenes de radar RMA/OHMC, ocultas hasta activarlas en la toolbar
    NeighborCountries.init(map).then(function () {
      NeighborCountries.setVisible(currentBaseKey === 'cartopy_dark');
    });

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
    // Los países vecinos (Chile/Brasil/Bolivia) sólo se muestran en el mapa
    // "Estilo Cartopy" custom, ya que en los demás basemaps esos países ya
    // aparecen naturalmente en los tiles de fondo.
    NeighborCountries.setVisible(key === 'cartopy_dark');
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

    const toggleDeptLabels = document.getElementById('toggleDeptLabels');
    toggleDeptLabels.addEventListener('change', function (e) {
      DeptLabels.setVisible(e.target.checked);
    });
    document.getElementById('btnDeptLabelStyle').addEventListener('click', function () {
      StyleEditor.showForDeptLabels();
    });

    const btnWatchTool = document.getElementById('btnWatchTool');
    const watchColorControls = document.getElementById('watchColorControls');
    btnWatchTool.addEventListener('click', function () {
      const nowActive = !WatchTool.isActive();
      WatchTool.setActive(nowActive);
      btnWatchTool.classList.toggle('active', nowActive);
      watchColorControls.classList.toggle('hidden', !nowActive);
      if (nowActive) {
        DrawTools.setTool(null); // las herramientas de dibujo libre y la de vigilancia son mutuamente excluyentes
      }
    });
    document.getElementById('watchColorInput').addEventListener('input', function (e) {
      WatchTool.setColor(e.target.value);
    });
    document.getElementById('btnClearWatches').addEventListener('click', function () {
      if (WatchTool.count() && !confirm('¿Quitar todas las vigilancias pintadas?')) return;
      WatchTool.clearAll();
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

    wireRadarControls();

    document.querySelectorAll('.tb-btn[data-tool]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tool = btn.getAttribute('data-tool');
        const isActive = btn.classList.contains('active');
        DrawTools.setTool(isActive ? null : tool);
        // Al elegir cualquier herramienta de dibujo libre, se desactiva la
        // herramienta de Vigilancia si estaba activa (son excluyentes).
        if (!isActive && WatchTool.isActive()) {
          WatchTool.setActive(false);
          document.getElementById('btnWatchTool').classList.remove('active');
          document.getElementById('watchColorControls').classList.add('hidden');
        }
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

  function wireRadarControls() {
    const toggleRadar = document.getElementById('toggleRadar');
    const radarControls = document.getElementById('radarControls');
    const btnRefreshRadar = document.getElementById('btnRefreshRadar');
    const radarOpacityInput = document.getElementById('radarOpacityInput');
    const radarLegendSection = document.getElementById('radarLegendSection');

    function renderLegend() {
      const bar = document.getElementById('radarLegendBar');
      const labels = document.getElementById('radarLegendLabels');
      const ticks = RadarLayer.getLegendTicks();
      const stops = ticks.map(function (t, i) {
        const pct = (i / (ticks.length - 1)) * 100;
        return 'rgb(' + t.color.join(',') + ') ' + pct + '%';
      }).join(', ');
      bar.style.background = 'linear-gradient(to right, ' + stops + ')';
      labels.innerHTML = ticks.map(function (t) { return '<span>' + t.value + '</span>'; }).join('');
    }

    function renderTimestamp() {
      const el = document.getElementById('radarLegendTimestamp');
      const cogs = RadarLayer.getActiveCogsInfo();
      if (!cogs.length) {
        el.textContent = 'Sin datos de radar disponibles en este momento.';
        return;
      }
      // Se muestra el timestamp más reciente entre todos los radares cargados
      const latest = cogs.reduce(function (a, b) {
        return new Date(a.observation_time) > new Date(b.observation_time) ? a : b;
      });
      const d = new Date(latest.observation_time);
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      el.textContent = 'Producto COLMAX · ' + cogs.length + ' radares · Último frame: ' + hh + ':' + mm + 'Z';
    }

    toggleRadar.addEventListener('change', async function (e) {
      const checked = e.target.checked;
      radarControls.classList.toggle('hidden', !checked);
      radarLegendSection.classList.toggle('hidden', !checked);
      if (!checked) {
        RadarLayer.setVisible(false);
        return;
      }
      toggleRadar.disabled = true;
      try {
        await RadarLayer.setVisible(true);
        renderLegend();
        renderTimestamp();
      } catch (err) {
        console.error('Error cargando radar OHMC:', err);
        alert('No se pudieron cargar las imágenes de radar del OHMC. Puede ser un problema temporal de conexión — probá de nuevo en unos segundos.');
        toggleRadar.checked = false;
        radarControls.classList.add('hidden');
        radarLegendSection.classList.add('hidden');
      } finally {
        toggleRadar.disabled = false;
      }
    });

    btnRefreshRadar.addEventListener('click', async function () {
      const originalText = btnRefreshRadar.textContent;
      btnRefreshRadar.textContent = '⏳';
      btnRefreshRadar.disabled = true;
      try {
        await RadarLayer.refresh();
        renderLegend();
        renderTimestamp();
      } catch (err) {
        console.error('Error actualizando radar OHMC:', err);
        alert('No se pudo actualizar el radar. Probá de nuevo en unos segundos.');
      } finally {
        btnRefreshRadar.textContent = originalText;
        btnRefreshRadar.disabled = false;
      }
    });

    radarOpacityInput.addEventListener('input', function (e) {
      RadarLayer.setOpacity(parseFloat(e.target.value));
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
