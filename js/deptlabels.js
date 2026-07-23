/* ==========================================================================
   deptlabels.js
   Etiquetas de texto con el nombre de TODOS los departamentos de
   Argentina, Paraguay y Uruguay (usa AdminRegions como fuente única de
   datos, compartida con la herramienta de "vigilancias"). Toggle general
   on/off, color de texto y color de contorno exterior del texto
   customizables vía rueda RGB, fuente Open Sans Bold.
   ========================================================================== */

const DeptLabels = (function () {

  let map = null;
  let layerGroup = null;
  let visible = false;
  let textColor = '#ffffff';
  let outlineColor = '#000000';

  // Con ~570 departamentos entre los 3 países, mostrar todas las etiquetas
  // al mismo tiempo con el mapa alejado (todo el continente) las hace
  // ilegibles por superposición. Se revelan progresivamente según el zoom,
  // igual que en cualquier atlas o mapa profesional: a menor zoom, sólo se
  // muestran las de mayor jerarquía/tamaño; a mayor zoom, todas.
  const MIN_ZOOM_ANY_LABEL = 6;   // por debajo de este zoom, no se muestra ninguna etiqueta
  const MIN_ZOOM_ALL_LABELS = 8;  // a partir de este zoom, se muestran todos los departamentos
  let zoomHandler = null;

  function buildTextShadow(color) {
    // Simula un contorno (stroke) de texto vía multiples text-shadow,
    // técnica estándar en CSS ya que no existe un stroke-color nativo
    // para texto en todos los navegadores de forma consistente.
    const d = '1px';
    return [
      `-${d} -${d} 0 ${color}`, `${d} -${d} 0 ${color}`,
      `-${d} ${d} 0 ${color}`, `${d} ${d} 0 ${color}`,
      `0 -${d} 0 ${color}`, `0 ${d} 0 ${color}`,
      `-${d} 0 0 ${color}`, `${d} 0 0 ${color}`
    ].join(', ');
  }

  function makeLabelIcon(name) {
    return L.divIcon({
      className: 'dept-label-icon',
      html: `<div class="dept-label-text" style="color:${textColor};text-shadow:${buildTextShadow(outlineColor)};">${name}</div>`,
      iconSize: null,
      iconAnchor: [0, 0]
    });
  }

  async function init(leafletMap) {
    map = leafletMap;
    await AdminRegions.init();
    rebuild();
  }

  function rebuild() {
    if (layerGroup && map) map.removeLayer(layerGroup);
    layerGroup = L.layerGroup();
    AdminRegions.getAll().forEach(function (region) {
      const marker = L.marker(region.centroid, {
        icon: makeLabelIcon(region.name),
        interactive: false,
        keyboard: false
      });
      marker._deptRegion = region;
      layerGroup.addLayer(marker);
    });
    if (visible) {
      layerGroup.addTo(map);
      applyZoomVisibility();
    }
  }

  // Decide cuántas etiquetas mostrar según el zoom actual, para evitar que
  // los ~570 departamentos se amontonen entre sí cuando el mapa muestra los
  // 3 países completos. Por debajo de MIN_ZOOM_ANY_LABEL no se muestra
  // ninguna; entre ese valor y MIN_ZOOM_ALL_LABELS se hace un muestreo
  // creciente; a partir de MIN_ZOOM_ALL_LABELS se muestran todas.
  function applyZoomVisibility() {
    if (!map || !layerGroup) return;
    const zoom = map.getZoom();
    layerGroup.eachLayer(function (marker) {
      const el = marker.getElement();
      if (!el) return;
      let show;
      if (zoom < MIN_ZOOM_ANY_LABEL) {
        show = false;
      } else if (zoom >= MIN_ZOOM_ALL_LABELS) {
        show = true;
      } else {
        // muestreo simple y estable por hash del nombre, para que a medida
        // que se acerca el zoom se vayan "sumando" etiquetas en vez de
        // parpadear cambiando cuáles se ven.
        const step = zoom - MIN_ZOOM_ANY_LABEL; // 0..(range-1)
        const range = MIN_ZOOM_ALL_LABELS - MIN_ZOOM_ANY_LABEL;
        const keepFraction = (step + 1) / (range + 1);
        show = simpleHash(marker._deptRegion.name) % 100 < keepFraction * 100;
      }
      el.style.display = show ? '' : 'none';
    });
  }

  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h % 100;
  }

  function setVisible(v) {
    visible = v;
    if (!map || !layerGroup) return;
    if (v) {
      layerGroup.addTo(map);
      applyZoomVisibility();
      if (!zoomHandler) {
        zoomHandler = applyZoomVisibility;
        map.on('zoomend', zoomHandler);
      }
    } else {
      map.removeLayer(layerGroup);
      if (zoomHandler) { map.off('zoomend', zoomHandler); zoomHandler = null; }
    }
  }

  function setTextColor(c) {
    textColor = c;
    rebuild();
  }

  function setOutlineColor(c) {
    outlineColor = c;
    rebuild();
  }

  function isVisible() { return visible; }
  function getTextColor() { return textColor; }
  function getOutlineColor() { return outlineColor; }

  return { init, setVisible, isVisible, setTextColor, setOutlineColor, getTextColor, getOutlineColor };
})();
