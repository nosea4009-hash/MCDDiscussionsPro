/* ==========================================================================
   basemaps.js
   Definición de las distintas capas base disponibles para el editor MCD.
   Incluye OSM, variantes de CARTO, y un modo "Cartopy" oscuro que consiste
   simplemente en un fondo gris oscuro (los límites se dibujan aparte en
   boundaries.js con color blanco).
   ========================================================================== */

const BASEMAPS = {
  osm: {
    isDark: false,
    tile: () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    })
  },
  carto_light: {
    isDark: false,
    tile: () => L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    })
  },
  carto_voyager: {
    isDark: false,
    tile: () => L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    })
  },
  carto_dark: {
    isDark: true,
    tile: () => L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    })
  },
  cartopy_dark: {
    isDark: true,
    // Estilo "Cartopy": sin tiles externos, sólo un fondo gris oscuro plano.
    // Los límites de provincias/departamentos se pintan encima en blanco.
    tile: () => L.tileLayer('', { opacity: 0 })
  },
  satellite_bw: {
    isDark: true,
    // Aproximación de un canal IR/visible en blanco y negro, estilo SPC,
    // usando un tileset gris de CARTO como base "nubosa" simulada.
    tile: () => L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    })
  },
  none: {
    isDark: false,
    tile: () => L.tileLayer('', { opacity: 0 })
  }
};

const CARTOPY_BG_COLOR = '#3d3d3d';

function applyBasemapBackground(mapDiv, key) {
  if (key === 'cartopy_dark') {
    mapDiv.style.background = CARTOPY_BG_COLOR;
  } else if (key === 'none') {
    mapDiv.style.background = '#ffffff';
  } else {
    mapDiv.style.background = '#dddddd';
  }
}
