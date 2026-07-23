/* ==========================================================================
   radar.js
   Imágenes de radar meteorológico ya procesadas (producto COLMAX — máximo
   compuesto de reflectividad en columna) de la Red de Radares Meteorológicos
   Argentinos (RMA), servidas por el visor "WebMet25" del Observatorio
   Hidrometeorológico de Mendoza (OHMC): https://webmet.ohmc.ar

   Investigación previa (vía consola de red del navegador) confirmó:
   - GET /api/v1/radars?active_only=true          -> lista de radares activos
   - GET /api/v1/cogs/latest?radar_code=X&product_key=COLMAX&vol_nr=01
         &vol_nr=02&strategy=0315                  -> último frame disponible
         por radar, con bbox, cog_vmin/cog_vmax (rango de dBZ) y una
         plantilla de tile_url estilo XYZ estándar: /api/v1/tiles/{id}/{z}/{x}/{y}.png
   - Los tiles pedidos con "?colormap=grayscale" devuelven píxeles en escala
     de grises puro (R=G=B), con alpha=0 donde no hay eco (transparente) y
     alpha=255 donde sí hay dato. El nivel de gris (0-255) se relaciona
     LINEALMENTE con la reflectividad real: dBZ = vmin + (gris/255)*(vmax-vmin).

   Esto permite recolorear cada tile en el propio navegador con la paleta
   que se prefiera, en vez de usar los colores que ya vienen "horneados" en
   el PNG con las 5 paletas oficiales del servidor (grc_th, grc_th2,
   grc_rain, grc_g, grayscale).

   Paleta usada: "NWSStormClearReflectivity" de MetPy/Unidata (BSD-3-Clause),
   la misma que usa NEXRAD/GR2Analyst para reflectividad en aire despejado.
   Fuente: https://github.com/Unidata/MetPy/blob/main/src/metpy/plots/colortable_files/NWSStormClearReflectivity.tbl
   Según la documentación de MetPy, esta tabla se usa con un punto de
   partida de -20 dBZ y un paso de 0.5 dBZ por color
   (ver ejemplo oficial: ('NWSStormClearReflectivity', -20, 0.5)).
   ========================================================================== */

const RadarLayer = (function () {

  const BASE_URL = 'https://webmet.ohmc.ar';
  const PRODUCT_KEY = 'COLMAX';
  const VOL_NRS = ['01', '02'];
  const STRATEGY = '0315';

  // Cómo se construyó la paleta NWSStormClearReflectivity a partir del
  // archivo .tbl de MetPy: el primer color corresponde a -20 dBZ, y cada
  // color subsiguiente representa +0.5 dBZ (194 colores → hasta ~76.5 dBZ).
  const PALETTE_START_DBZ = -20;
  const PALETTE_STEP_DBZ = 0.5;

  const RADAR_PANE_NAME = 'radarPane';

  let map = null;
  let palette = null;          // array de [r,g,b]
  let layerGroup = null;       // L.LayerGroup con una capa de tiles por radar
  let visible = false;
  let radarsMeta = [];         // metadata de /api/v1/radars
  let activeCogs = [];         // último cog cargado por radar (para info/debug)

  /* -------------------- Paleta y recoloreo -------------------- */

  async function loadPalette() {
    if (palette) return palette;
    const resp = await fetch('data/nws_storm_clear_reflectivity.json');
    const data = await resp.json();
    palette = data.colors;
    return palette;
  }

  function dbzToColor(dbz) {
    let idx = Math.round((dbz - PALETTE_START_DBZ) / PALETTE_STEP_DBZ);
    if (idx < 0) idx = 0;
    if (idx > palette.length - 1) idx = palette.length - 1;
    return palette[idx];
  }

  // Recolorea in-place el buffer RGBA de un ImageData: convierte cada
  // píxel gris (dato de reflectividad) a su color correspondiente en la
  // paleta NWSStormClearReflectivity. Los píxeles transparentes (sin eco)
  // se dejan intactos.
  function recolorPixels(data, vmin, vmax) {
    const range = vmax - vmin;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha === 0) continue;
      const gray = data[i]; // R === G === B en los tiles "grayscale" del OHMC
      const dbz = vmin + (gray / 255) * range;
      const color = dbzToColor(dbz);
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      // alpha se mantiene en 255 (dato presente); la opacidad general del
      // radar se controla aparte con layer.setOpacity(), no acá, para poder
      // ajustarla sin tener que volver a pedir/recolorear los tiles.
    }
  }

  // Conversión estándar de coordenada de tile Y (Web Mercator/EPSG:3857) a
  // latitud, usada para recalcular el bounding box geográfico exacto de un
  // tile a partir de sus coordenadas z/x/y.
  function tileYToLat(y, n) {
    const merc = Math.PI - 2 * Math.PI * y / n;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(merc) - Math.exp(-merc)));
  }

  // NOTA: en algunos frames puede notarse un borde recto sutil dentro del
  // área de cobertura de un radar puntual. Esto no es un bug de esta
  // implementación: el propio GeoTIFF (COG) que sirve el OHMC para ese
  // radar/instante viene recortado con ese límite rectangular en el
  // archivo fuente (posiblemente por una estrategia de escaneo o cobertura
  // parcial en ese volumen específico). El recorte circular de abajo
  // igualmente evita que se vea el borde del bounding box completo fuera
  // del radio máximo de cobertura del radar.
  const METERS_PER_DEG_LAT = 110574; // aproximación esférica, suficiente para este recorte estético
  function metersPerDegLon(latDeg) {
    return 111320 * Math.cos(latDeg * Math.PI / 180);
  }

  // El COG (GeoTIFF) que sirve el OHMC es rectangular (bounding box), pero
  // la cobertura real de un radar es un círculo de radio `radar_coverage_m`
  // centrado en el propio radar. Sin este recorte, se nota un borde recto
  // en la imagen exportada allí donde el bbox rectangular no tiene datos
  // pero tampoco corresponde a la cobertura circular real. Se vuelven
  // transparentes los píxeles que caen fuera de ese círculo.
  function applyCircularMask(data, size, nw, se, centerLat, centerLon, radiusM) {
    const latSpan = se.lat - nw.lat;
    const lonSpan = se.lng - nw.lng;
    const mPerLon = metersPerDegLon(centerLat);
    for (let py = 0; py < size.y; py++) {
      const lat = nw.lat + ((py + 0.5) / size.y) * latSpan;
      const dy = (lat - centerLat) * METERS_PER_DEG_LAT;
      for (let px = 0; px < size.x; px++) {
        const idx = (py * size.x + px) * 4;
        if (data[idx + 3] === 0) continue;
        const lon = nw.lng + ((px + 0.5) / size.x) * lonSpan;
        const dx = (lon - centerLon) * mPerLon;
        if ((dx * dx + dy * dy) > (radiusM * radiusM)) {
          data[idx + 3] = 0;
        }
      }
    }
  }

  /* -------------------- Capa de tiles con recoloreo en canvas -------------------- */

  const RecoloredRadarTileLayer = L.TileLayer.extend({
    createTile: function (coords, done) {
      const size = this.getTileSize();
      const tile = document.createElement('canvas');
      tile.width = size.x;
      tile.height = size.y;
      const ctx = tile.getContext('2d');

      const img = new Image();
      img.crossOrigin = 'anonymous'; // el OHMC responde con CORS abierto en sus tiles
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, size.x, size.y);
          const imgData = ctx.getImageData(0, 0, size.x, size.y);
          recolorPixels(imgData.data, this.options.vmin, this.options.vmax);
          if (this.options.centerLat != null && this.options.radiusM) {
            // Calcula el rectángulo geográfico exacto de este tile a partir
            // de sus coordenadas XYZ (fórmula estándar de proyección Web
            // Mercator), sin depender de métodos privados de Leaflet.
            const n = Math.pow(2, coords.z);
            const lonNW = coords.x / n * 360 - 180;
            const lonSE = (coords.x + 1) / n * 360 - 180;
            const latNW = tileYToLat(coords.y, n);
            const latSE = tileYToLat(coords.y + 1, n);
            applyCircularMask(
              imgData.data, size,
              { lat: latNW, lng: lonNW }, { lat: latSE, lng: lonSE },
              this.options.centerLat, this.options.centerLon, this.options.radiusM
            );
          }
          ctx.putImageData(imgData, 0, 0);
        } catch (e) {
          console.warn('RadarLayer: no se pudo recolorear un tile, se deja en blanco.', e);
        }
        done(null, tile);
      };
      img.onerror = () => {
        // Fuera del área de cobertura del radar o tile sin datos: se deja
        // el canvas transparente, sin marcarlo como error visual.
        done(null, tile);
      };
      img.src = this.getTileUrl(coords);
      return tile;
    }
  });

  /* -------------------- Datos del OHMC -------------------- */

  async function fetchActiveRadars() {
    const resp = await fetch(BASE_URL + '/api/v1/radars?active_only=true');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    return data.radars || [];
  }

  function buildLatestCogUrl(radarCode) {
    const params = new URLSearchParams();
    params.set('radar_code', radarCode);
    params.set('product_key', PRODUCT_KEY);
    VOL_NRS.forEach(v => params.append('vol_nr', v));
    params.set('strategy', STRATEGY);
    return BASE_URL + '/api/v1/cogs/latest?' + params.toString();
  }

  async function fetchLatestCog(radarCode) {
    try {
      const resp = await fetch(buildLatestCogUrl(radarCode));
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data || !data.tile_url || !data.bbox) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function makeLayerFromCog(cog, radarMeta) {
    const tileUrlTemplate = BASE_URL + cog.tile_url + '?colormap=grayscale';
    const bounds = L.latLngBounds(
      [cog.bbox.min_lat, cog.bbox.min_lon],
      [cog.bbox.max_lat, cog.bbox.max_lon]
    );
    return new RecoloredRadarTileLayer(tileUrlTemplate, {
      vmin: cog.cog_vmin,
      vmax: cog.cog_vmax,
      pane: RADAR_PANE_NAME,
      bounds: bounds,
      tileSize: 256,
      minZoom: 0,
      maxZoom: 14,
      opacity: 1,
      updateWhenZooming: false,
      keepBuffer: 1,
      // Recorte circular por el radio real de cobertura del radar (según
      // /api/v1/radars), para que no se vea el borde recto del bounding
      // box rectangular del GeoTIFF donde no hay cobertura real del haz.
      centerLat: radarMeta ? radarMeta.center_lat : null,
      centerLon: radarMeta ? radarMeta.center_long : null,
      radiusM: cog.radar_coverage_m || null
    });
  }

  /* -------------------- API pública -------------------- */

  async function init(leafletMap) {
    map = leafletMap;

    // Pane dedicado, con el mismo criterio que la capa de Vigilancias: el
    // radar debe quedar por DEBAJO de los límites administrativos, rutas,
    // y de cualquier elemento dibujado por el usuario (áreas MCD, frentes,
    // etc.), para que esas referencias sigan siendo legibles por encima de
    // la imagen de reflectividad. Se ubica apenas por encima del tilePane
    // (200) del mapa base, y por debajo del overlayPane (400).
    if (!map.getPane(RADAR_PANE_NAME)) {
      map.createPane(RADAR_PANE_NAME);
      map.getPane(RADAR_PANE_NAME).style.zIndex = 250;
      map.getPane(RADAR_PANE_NAME).style.pointerEvents = 'none';
    }

    await loadPalette();
  }

  // Descarga la lista de radares activos y el frame más reciente de cada
  // uno, y reconstruye la capa combinada. Se usa tanto al activar el radar
  // por primera vez como al presionar "Actualizar".
  async function refresh() {
    if (!palette) await loadPalette();
    radarsMeta = await fetchActiveRadars();

    const cogs = await Promise.all(
      radarsMeta.map(r => fetchLatestCog(r.code))
    );

    if (layerGroup) {
      map.removeLayer(layerGroup);
      layerGroup = null;
    }

    activeCogs = [];
    const newGroup = L.layerGroup();
    radarsMeta.forEach((radar, i) => {
      const cog = cogs[i];
      if (!cog) return; // radar sin frame reciente disponible; se omite
      const layer = makeLayerFromCog(cog, radar);
      newGroup.addLayer(layer);
      activeCogs.push({ radar_code: radar.code, title: radar.title, observation_time: cog.observation_time });
    });

    layerGroup = newGroup;
    if (visible) layerGroup.addTo(map);

    return activeCogs;
  }

  async function setVisible(v) {
    visible = v;
    if (!map) return;
    if (v) {
      if (!layerGroup || activeCogs.length === 0) {
        await refresh();
      } else {
        layerGroup.addTo(map);
      }
    } else if (layerGroup) {
      map.removeLayer(layerGroup);
    }
  }

  function isVisible() { return visible; }

  function setOpacity(o) {
    if (!layerGroup) return;
    layerGroup.eachLayer(function (layer) { layer.setOpacity(o); });
  }

  function getActiveCogsInfo() { return activeCogs.slice(); }

  // Genera los "ticks" (valor dBZ + color) usados para dibujar la leyenda
  // de la paleta en la interfaz, en pasos de 10 dBZ dentro de un rango
  // representativo del producto COLMAX del OHMC.
  function getLegendTicks() {
    const values = [-20, -10, 0, 10, 20, 30, 40, 50, 60, 70];
    return values.map(v => ({ value: v, color: dbzToColor(v) }));
  }

  return {
    init, refresh, setVisible, isVisible, setOpacity,
    getActiveCogsInfo, getLegendTicks
  };
})();
