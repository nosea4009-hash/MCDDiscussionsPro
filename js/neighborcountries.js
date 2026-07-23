/* ==========================================================================
   neighborcountries.js
   Países limítrofes que NO forman parte del área de trabajo del editor
   (Chile, Brasil, Bolivia), dibujados en gris claro con su nombre en
   Open Sans Bold. Pensado específicamente para dar contexto geográfico en
   el mapa "Estilo Cartopy" (fondo gris oscuro custom), donde de otra forma
   esos países quedarían como un vacío sin ninguna referencia.

   Se muestra únicamente cuando el mapa base activo es 'cartopy_dark'; en
   los demás mapas base (OSM, CARTO, satelital) esos países ya se ven de
   forma natural en los tiles, por lo que esta capa se oculta para no
   duplicar/interferir visualmente.
   ========================================================================== */

const NeighborCountries = (function () {

  let map = null;
  let fillLayer = null;
  let labelsLayer = null;
  let data = null;

  const NAME_ES = {
    'Chile': 'CHILE',
    'Brazil': 'BRASIL',
    'Bolivia': 'BOLIVIA'
  };

  const FILL_COLOR = '#6b6b6b';   // gris más claro que el fondo Cartopy (#3d3d3d)
  const BORDER_COLOR = '#8a8a8a';

  function makeLabelIcon(name) {
    return L.divIcon({
      className: 'neighbor-country-label-icon',
      html: `<div class="neighbor-country-label">${name}</div>`,
      iconSize: null,
      iconAnchor: [0, 0]
    });
  }

  async function init(leafletMap) {
    map = leafletMap;
    const resp = await fetch('data/paises_vecinos.geojson');
    data = await resp.json();

    fillLayer = L.geoJSON(data, {
      style: { color: BORDER_COLOR, weight: 1, opacity: 1, fill: true, fillColor: FILL_COLOR, fillOpacity: 1 },
      interactive: false
    });

    labelsLayer = L.layerGroup();
    data.features.forEach(function (f) {
      const p = f.properties;
      const label = NAME_ES[p.name] || p.name.toUpperCase();
      const marker = L.marker([p.label_lat, p.label_lon], {
        icon: makeLabelIcon(label),
        interactive: false,
        keyboard: false
      });
      labelsLayer.addLayer(marker);
    });
  }

  function setVisible(v) {
    if (!map || !fillLayer || !labelsLayer) return;
    if (v) {
      fillLayer.addTo(map);
      labelsLayer.addTo(map);
      // Estos países deben quedar DEBAJO de los límites/capas propias del
      // editor (provincias, departamentos, rutas, elementos dibujados), así
      // que se envían al fondo apenas se agregan.
      if (fillLayer.bringToBack) fillLayer.bringToBack();
    } else {
      map.removeLayer(fillLayer);
      map.removeLayer(labelsLayer);
    }
  }

  return { init, setVisible };
})();
