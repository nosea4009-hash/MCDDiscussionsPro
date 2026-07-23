/* ==========================================================================
   watches.js
   Sistema de "vigilancias" (watches) estilo SPC/NWS de EE.UU. (Severe
   Thunderstorm Watch, Tornado Watch, Winter Storm Watch, etc.), pero
   aplicado a Argentina/Paraguay/Uruguay coloreando departamentos completos
   en vez de dibujar un polígono libre.

   Flujo: se activa la herramienta "Vigilancia", el usuario hace clic sobre
   uno o más departamentos en el mapa, y cada uno se pinta con el color de
   relleno elegido. El contorno exterior de cada departamento pintado se
   dibuja automáticamente en un tono más oscuro del mismo color (igual que
   los "county outlines" resaltados en los watch boxes de EE.UU.).
   ========================================================================== */

const WatchTool = (function () {

  let map = null;
  let active = false;
  let currentColor = '#ffd400'; // amarillo clásico de "Severe Thunderstorm Watch"
  let watchedRegions = new Map(); // regionId -> { layer, region }
  let clickHandler = null;

  function darkenHex(hex, amount) {
    amount = amount != null ? amount : 0.35;
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const dr = Math.max(0, Math.round(r * (1 - amount)));
    const dg = Math.max(0, Math.round(g * (1 - amount)));
    const db = Math.max(0, Math.round(b * (1 - amount)));
    return '#' + [dr, dg, db].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  async function init(leafletMap) {
    map = leafletMap;
    await AdminRegions.init();
  }

  function setActive(v) {
    active = v;
    if (!map) return;
    if (v) {
      map.getContainer().style.cursor = 'pointer';
      clickHandler = onMapClick;
      map.on('click', clickHandler);
    } else {
      map.getContainer().style.cursor = '';
      if (clickHandler) { map.off('click', clickHandler); clickHandler = null; }
    }
  }

  function isActive() { return active; }

  function onMapClick(e) {
    const region = AdminRegions.findRegionAtLatLng(e.latlng);
    if (!region) return;
    toggleRegion(region);
  }

  function toggleRegion(region) {
    if (watchedRegions.has(region.id)) {
      removeRegion(region.id);
      return;
    }
    paintRegion(region);
  }

  function paintRegion(region) {
    const outline = darkenHex(currentColor, 0.35);
    const layer = L.geoJSON(region.feature, {
      style: {
        color: outline,
        weight: 2.5,
        opacity: 1,
        fill: true,
        fillColor: currentColor,
        fillOpacity: 0.55
      },
      interactive: true
    });
    layer.on('click', function (ev) {
      L.DomEvent.stopPropagation(ev);
      if (active) removeRegion(region.id);
    });
    layer.addTo(map);
    watchedRegions.set(region.id, { layer, region });
  }

  function removeRegion(regionId) {
    const entry = watchedRegions.get(regionId);
    if (!entry) return;
    map.removeLayer(entry.layer);
    watchedRegions.delete(regionId);
  }

  function setColor(c) {
    currentColor = c;
    // Re-pinta todas las regiones ya vigiladas con el nuevo color
    const outline = darkenHex(c, 0.35);
    watchedRegions.forEach(function (entry) {
      entry.layer.setStyle({ color: outline, fillColor: c });
    });
  }

  function getColor() { return currentColor; }

  function clearAll() {
    watchedRegions.forEach(function (entry) { map.removeLayer(entry.layer); });
    watchedRegions.clear();
  }

  function count() { return watchedRegions.size; }

  return { init, setActive, isActive, setColor, getColor, clearAll, count };
})();
