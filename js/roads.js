/* ==========================================================================
   roads.js
   Capa de rutas nacionales / autopistas de Argentina (RN / RNA), estilo
   naranja oscuro clásico de mapa vial, con un contorno exterior (casing)
   de color customizable, similar al patrón "casing + fill" que usan la
   mayoría de los renderers de mapas para carreteras.

   Fuente de datos: OpenStreetMap (vía Overpass API), filtrado a rutas con
   ref RN#### / RNA#### dentro del territorio de Argentina, y simplificado
   con Ramer-Douglas-Peucker para mantener el archivo liviano.
   ========================================================================== */

const RoadsLayer = (function () {

  let map = null;
  let casingLayer = null; // contorno exterior (dibujado primero, más ancho)
  let fillLayer = null;   // línea naranja principal (encima, más angosta)
  let roadColor = '#b45300';   // naranja oscuro
  let casingColor = '#000000'; // contorno exterior, customizable
  let visible = false;

  function fillStyle() {
    return { color: roadColor, weight: 2.2, opacity: 1, lineJoin: 'round', lineCap: 'round' };
  }
  function casingStyle() {
    return { color: casingColor, weight: 4.2, opacity: 1, lineJoin: 'round', lineCap: 'round' };
  }

  async function init(leafletMap) {
    map = leafletMap;
    const resp = await fetch('data/rutas.geojson');
    const data = await resp.json();

    casingLayer = L.geoJSON(data, { style: casingStyle(), interactive: false });
    fillLayer = L.geoJSON(data, { style: fillStyle(), interactive: false });

    return { casingLayer, fillLayer };
  }

  function setVisible(v) {
    visible = v;
    if (!map || !casingLayer || !fillLayer) return;
    if (v) {
      casingLayer.addTo(map);
      fillLayer.addTo(map);
    } else {
      map.removeLayer(casingLayer);
      map.removeLayer(fillLayer);
    }
  }

  function isVisible() { return visible; }

  function setRoadColor(c) {
    roadColor = c;
    if (fillLayer) fillLayer.setStyle(fillStyle());
  }

  function setCasingColor(c) {
    casingColor = c;
    if (casingLayer) casingLayer.setStyle(casingStyle());
  }

  function getRoadColor() { return roadColor; }
  function getCasingColor() { return casingColor; }

  return { init, setVisible, isVisible, setRoadColor, setCasingColor, getRoadColor, getCasingColor };
})();
