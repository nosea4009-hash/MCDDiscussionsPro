/* ==========================================================================
   boundaries.js
   Carga y estilizado de límites provinciales y departamentales de Argentina
   a partir de los GeoJSON incluidos en /data. No se simplifican los
   polígonos: se usan tal cual vienen del origen (IGN / simplemaps).
   ========================================================================== */

const BoundariesLayer = (function () {

  let provinciasLayer = null;
  let departamentosLayer = null;
  let map = null;

  // Colores/grosores dependiendo si el basemap actual es oscuro o claro.
  // En modo oscuro (Cartopy / Carto Dark) los límites van en blanco.
  // En modo claro (OSM / Carto Light) van en gris oscuro para que se lean.
  function provinceStyle(isDark) {
    return {
      color: isDark ? '#ffffff' : '#222222',
      weight: 2.4,
      opacity: 1,
      fill: false,
      lineJoin: 'round'
    };
  }

  function deptoStyle(isDark) {
    return {
      color: isDark ? '#ffffff' : '#555555',
      weight: 0.8,
      opacity: 0.85,
      fill: false,
      lineJoin: 'round'
    };
  }

  async function init(leafletMap) {
    map = leafletMap;

    const [provResp, deptResp] = await Promise.all([
      fetch('data/provincias.json'),
      fetch('data/departamentos.geojson')
    ]);
    const provData = await provResp.json();
    const deptData = await deptResp.json();

    departamentosLayer = L.geoJSON(deptData, {
      style: deptoStyle(true),
      interactive: false
    });

    provinciasLayer = L.geoJSON(provData, {
      style: provinceStyle(true),
      interactive: false
    });

    // Orden: departamentos primero (abajo), provincias arriba (más gruesas)
    departamentosLayer.addTo(map);
    provinciasLayer.addTo(map);

    return { provinciasLayer, departamentosLayer, provData, deptData };
  }

  function setDarkMode(isDark) {
    if (provinciasLayer) provinciasLayer.setStyle(provinceStyle(isDark));
    if (departamentosLayer) departamentosLayer.setStyle(deptoStyle(isDark));
  }

  function setProvinciasVisible(visible) {
    if (!provinciasLayer || !map) return;
    if (visible) map.addLayer(provinciasLayer);
    else map.removeLayer(provinciasLayer);
  }

  function setDepartamentosVisible(visible) {
    if (!departamentosLayer || !map) return;
    if (visible) map.addLayer(departamentosLayer);
    else map.removeLayer(departamentosLayer);
  }

  function getProvinciasLayer() { return provinciasLayer; }
  function getDepartamentosLayer() { return departamentosLayer; }

  return {
    init,
    setDarkMode,
    setProvinciasVisible,
    setDepartamentosVisible,
    getProvinciasLayer,
    getDepartamentosLayer
  };
})();
