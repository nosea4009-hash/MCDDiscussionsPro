/* ==========================================================================
   regionmask.js
   Restringe la creación de Áreas MCD y Contornos de color a que estén,
   al menos parcialmente, dentro de Argentina, Paraguay o Uruguay. Se usa
   como validación previa a registrar el polígono dibujado en drawtools.js.

   La comprobación se hace contra las provincias de Argentina (24) más los
   departamentos de Paraguay (18) y Uruguay (19) — la unión de esos
   conjuntos equivale al territorio de los 3 países. En vez de calcular una
   unión geométrica (costoso y propenso a errores con turf.union sobre
   tantos polígonos), simplemente se comprueba si el polígono dibujado
   intersecta con AL MENOS UNA de esas 61 geometrías, lo cual es
   equivalente y mucho más liviano.
   ========================================================================== */

const RegionMask = (function () {

  let allowedFeatures = null;
  let loadingPromise = null;

  async function init() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async function () {
      const [provResp, pyResp, uyResp] = await Promise.all([
        fetch('data/provincias.json'),
        fetch('data/paraguay.json'),
        fetch('data/uruguay.json')
      ]);
      const [provData, pyData, uyData] = await Promise.all([
        provResp.json(), pyResp.json(), uyResp.json()
      ]);
      allowedFeatures = [].concat(provData.features, pyData.features, uyData.features);
      return allowedFeatures;
    })();
    return loadingPromise;
  }

  function isReady() { return !!allowedFeatures; }

  // Convierte los LatLng de Leaflet (getLatLngs() de un polígono recién
  // dibujado) a un Polygon de turf.js, cerrando el anillo si es necesario.
  function latlngsToTurfPolygon(latlngs) {
    let ring = latlngs;
    while (Array.isArray(ring[0])) ring = ring[0];
    if (!ring.length) return null;
    const coords = ring.map(function (ll) { return [ll.lng, ll.lat]; });
    const first = coords[0], last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
    if (coords.length < 4) return null;
    try {
      return turf.polygon([coords]);
    } catch (e) {
      return null;
    }
  }

  // Devuelve true si el polígono (LatLng[] de Leaflet) intersecta con
  // Argentina, Paraguay o Uruguay. Si los datos todavía no cargaron,
  // permite la creación (fail-open) para no bloquear al usuario por un
  // problema de timing de red, pero deja un aviso en consola.
  function intersectsAllowedRegion(latlngs) {
    if (!allowedFeatures) {
      console.warn('RegionMask: datos de países aún no cargados; se permite la forma por defecto.');
      return true;
    }
    const poly = latlngsToTurfPolygon(latlngs);
    if (!poly) return false;
    for (let i = 0; i < allowedFeatures.length; i++) {
      try {
        if (turf.booleanIntersects(poly, allowedFeatures[i])) return true;
      } catch (e) { /* geometría inválida, seguir */ }
    }
    return false;
  }

  return { init, isReady, intersectsAllowedRegion };
})();
