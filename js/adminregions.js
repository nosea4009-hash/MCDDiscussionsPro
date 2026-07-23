/* ==========================================================================
   adminregions.js
   Carga y combina las divisiones administrativas de nivel "departamento"
   de Argentina, Paraguay y Uruguay en una única lista normalizada, para ser
   reutilizada por:
     - deptlabels.js  (etiquetas de todos los departamentos)
     - drawtools.js   (herramienta de "vigilancias" que colorea un
                        departamento/municipio al hacer clic sobre él)

   Nota de terminología: Paraguay y Uruguay no tienen un nivel "provincia +
   departamento" como Argentina; sus geojson (paraguay.json / uruguay.json)
   YA representan directamente sus departamentos (18 y 19 respectivamente),
   por lo que se usan tal cual.
   ========================================================================== */

const AdminRegions = (function () {

  let regions = null; // [{ id, name, country, feature, centroid: [lat,lon] }]
  let loadingPromise = null;

  function centroidFromArDepto(feature) {
    const c = feature.properties && feature.properties.centroide;
    if (c && typeof c.lat === 'number' && typeof c.lon === 'number') {
      return [c.lat, c.lon];
    }
    return centroidFromGeometry(feature);
  }

  // Centroide simple del anillo exterior más grande de un Polygon/MultiPolygon,
  // usado como respaldo cuando no viene un centroide precalculado (PY/UY).
  function centroidFromGeometry(feature) {
    try {
      if (typeof turf !== 'undefined' && turf.centroid) {
        const c = turf.centroid(feature);
        const [lon, lat] = c.geometry.coordinates;
        return [lat, lon];
      }
    } catch (e) { /* fall through to manual calc */ }

    const geom = feature.geometry;
    let ring;
    if (geom.type === 'Polygon') {
      ring = geom.coordinates[0];
    } else if (geom.type === 'MultiPolygon') {
      ring = geom.coordinates.reduce((a, b) => (a[0].length > b[0].length ? a : b))[0];
    } else {
      return [0, 0];
    }
    let sx = 0, sy = 0;
    ring.forEach(([lon, lat]) => { sx += lon; sy += lat; });
    return [sy / ring.length, sx / ring.length];
  }

  async function init() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async function () {
      const [deptResp, pyResp, uyResp] = await Promise.all([
        fetch('data/departamentos.geojson'),
        fetch('data/paraguay.json'),
        fetch('data/uruguay.json')
      ]);
      const [deptData, pyData, uyData] = await Promise.all([
        deptResp.json(), pyResp.json(), uyResp.json()
      ]);

      const list = [];
      let seq = 0;

      deptData.features.forEach(function (f) {
        list.push({
          id: 'AR_' + (seq++),
          name: f.properties.nombre,
          provincia: f.properties.provincia ? f.properties.provincia.nombre : null,
          country: 'Argentina',
          feature: f,
          centroid: centroidFromArDepto(f)
        });
      });

      pyData.features.forEach(function (f) {
        list.push({
          id: 'PY_' + (seq++),
          name: f.properties.name,
          provincia: null,
          country: 'Paraguay',
          feature: f,
          centroid: centroidFromGeometry(f)
        });
      });

      uyData.features.forEach(function (f) {
        list.push({
          id: 'UY_' + (seq++),
          name: f.properties.name,
          provincia: null,
          country: 'Uruguay',
          feature: f,
          centroid: centroidFromGeometry(f)
        });
      });

      regions = list;
      return regions;
    })();
    return loadingPromise;
  }

  function getAll() { return regions || []; }
  function isReady() { return !!regions; }

  // Convierte la geometría GeoJSON de una región a un array de LatLng de
  // Leaflet, reutilizando el parser interno de L.GeoJSON (soporta Polygon).
  function toLatLngs(region) {
    const tmp = L.geoJSON(region.feature);
    const layer = tmp.getLayers()[0];
    return layer ? layer.getLatLngs() : null;
  }

  // Busca la región cuyo polígono contiene el punto dado (para la
  // herramienta de "vigilancia"). Usa turf.booleanPointInPolygon.
  function findRegionAtLatLng(latlng) {
    if (!regions || typeof turf === 'undefined') return null;
    const pt = turf.point([latlng.lng, latlng.lat]);
    for (const region of regions) {
      try {
        if (turf.booleanPointInPolygon(pt, region.feature)) return region;
      } catch (e) { /* geometría inválida, seguir con la próxima */ }
    }
    return null;
  }

  return { init, getAll, isReady, toLatLngs, findRegionAtLatLng };
})();
