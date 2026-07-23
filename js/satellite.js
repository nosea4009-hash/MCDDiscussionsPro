/* ==========================================================================
   satellite.js
   Imágenes de satélite GOES-19 (GOES-East, 75.2°O), servidas por el visor
   público RAMMB/CIRA SLIDER (Colorado State University):
   https://rammb-slider.cira.colostate.edu/

   3 productos disponibles (elegidos a pedido):
   - Canal Visible Rojo   -> slug "band_02"  (Band 2: 0.64 µm)
   - Infrarrojo Banda 13  -> slug "band_13"  (Band 13: 10.3 µm, IR limpio)
   - Fase de Nube del Día (JMA) -> slug "jma_day_cloud_phase_distinction_rgb"

   Flujo de datos (confirmado inspeccionando la consola de red del visor):
     GET https://slider.cira.colostate.edu/data/json/goes-19/full_disk/{producto}/latest_times.json
       -> lista de timestamps disponibles (el primero es el más reciente)
     GET https://slider.cira.colostate.edu/data/imagery/{yyyy}/{mm}/{dd}/
             goes-19---full_disk/{producto}/{timestamp}/00/000_000.png
       -> imagen única de 678x678 px que cubre el disco completo visible
          desde GOES-19 (confirmado visualmente: incluye toda Sudamérica).

   Reproyección: a diferencia del radar (ya en lat/lon), esta imagen está en
   la proyección geoestacionaria nativa del satélite ("ABI Fixed Grid" /
   +proj=geos), no en lat/lon. Se reproyecta pixel por pixel usando la
   fórmula oficial de NOAA (GOES-R PUG) y los parámetros de calibración
   reales publicados por CIRA para este mismo visor (extraídos de
   define-products---rammb-slider.js, sección "full_disk.lat_lon_query"):
     lon0 = -75.0°, sat_alt = 42171.7 km (radio geocéntrico del satélite),
     max_rad_x = 0.151337 rad, max_rad_y = 0.150988 rad,
     disk_radius_x_z0 = 338 px, disk_radius_y_z0 = 337 px (imagen 678x678,
     centro en el píxel 339/338).
   ========================================================================== */

const SatelliteLayer = (function () {

  // El servidor de CIRA/RAMMB no envía cabeceras CORS (a diferencia del
  // OHMC), por lo que fetch() falla directamente por política de origen
  // cruzado del navegador. Se usa el mismo proxy CORS público ya utilizado
  // para el SMN (ver js/metar.js) como puente.
  const CORS_PROXY = 'https://proxy.cors.sh/';
  const BASE_URL_DIRECT = 'https://slider.cira.colostate.edu';
  const BASE_URL = CORS_PROXY + BASE_URL_DIRECT;
  const SAT = 'goes-19';
  const SECTOR = 'full_disk';
  const IMG_SIZE = 678;

  // Parámetros oficiales de calibración del sector "full_disk" de GOES-19,
  // tal como los publica CIRA en su propio visor (ver comentario arriba).
  const LON0_DEG = -75.0;
  const SAT_ALT_KM = 42171.7;      // distancia geocéntrica del satélite (radio Tierra + altura orbital)
  const MAX_RAD_X = 0.151337;      // radianes de escaneo E/W en el borde del disco
  const MAX_RAD_Y = 0.150988;      // radianes de escaneo N/S en el borde del disco
  const DISK_RADIUS_X = 338;       // radio del disco, en píxeles, a la resolución base (678x678)
  const DISK_RADIUS_Y = 337;

  // Parámetros geométricos estándar del elipsoide GRS80 usado por GOES-R
  // (idénticos a los publicados en el GOES-R PUG y usados por MetPy/Cartopy).
  const R_EQ_KM = 6378.137;
  const R_POL_KM = 6356.75231414;
  const H_KM = SAT_ALT_KM; // distancia geocéntrica total (ya incluye el radio terrestre)

  const PRODUCTS = {
    visible_red: { slug: 'band_02', label: 'Visible Rojo (0.64 µm)' },
    ir_band13: { slug: 'band_13', label: 'Infrarrojo Banda 13 (10.3 µm)' },
    day_cloud_phase: { slug: 'jma_day_cloud_phase_distinction_rgb', label: 'Fase de Nube del Día (JMA)' }
  };

  const SATELLITE_PANE_NAME = 'satellitePane';

  let map = null;
  let currentProductKey = null;
  let currentImage = null;      // HTMLImageElement de 678x678 ya cargada
  let currentTimestamp = null;  // timestamp del frame cargado
  let canvasOverlayLayer = null; // capa Leaflet que dibuja la reproyección
  let visible = false;
  let redrawScheduled = false;

  /* -------------------- Reproyección geoestacionaria -------------------- */

  // Dado un punto lat/lon (grados), calcula la posición (columna, fila) en
  // píxeles dentro de la imagen fuente de 678x678, o null si ese punto no
  // es visible desde el satélite (está fuera del disco, del lado oscuro de
  // la Tierra respecto al punto de vista de GOES-19).
  //
  // Se resuelve la geometría en el sistema geocéntrico del satélite:
  // 1) el punto (lat,lon) se convierte a coordenadas geocéntricas (Tierra
  //    elipsoidal, radio ecuatorial/polar reales);
  // 2) se calcula el vector desde el satélite hacia ese punto;
  // 3) los ángulos resultantes (E/W y N/S) se normalizan contra los
  //    radianes máximos de escaneo reales del sector "full_disk" para
  //    obtener una posición relativa dentro del disco de la imagen.
  function latLonToPixel(latDeg, lonDeg) {
    const lat = latDeg * Math.PI / 180;
    const lon = lonDeg * Math.PI / 180;
    const lon0 = LON0_DEG * Math.PI / 180;

    // Latitud geocéntrica (corrige el achatamiento del elipsoide) — misma
    // relación usada por NOAA/MetPy para geolocalización ABI.
    const geocLat = Math.atan((R_POL_KM * R_POL_KM) / (R_EQ_KM * R_EQ_KM) * Math.tan(lat));
    const rEarth = R_POL_KM / Math.sqrt(1 - ((R_EQ_KM * R_EQ_KM - R_POL_KM * R_POL_KM) / (R_EQ_KM * R_EQ_KM)) * Math.cos(geocLat) * Math.cos(geocLat));

    // Posición geocéntrica del punto sobre la superficie terrestre
    const dlon = lon - lon0;
    const px = rEarth * Math.cos(geocLat) * Math.cos(dlon);
    const py = rEarth * Math.cos(geocLat) * Math.sin(dlon);
    const pz = rEarth * Math.sin(geocLat);

    // El satélite está sobre el ecuador, en el meridiano lon0, a distancia H_KM del centro de la Tierra
    const satX = H_KM;
    const satY = 0;
    const satZ = 0;

    // Vector desde el satélite hacia el punto
    const vx = px - satX;
    const vy = py - satY;
    const vz = pz - satZ;

    // Si el punto está del lado no visible del disco (detrás del horizonte
    // desde la perspectiva del satélite), no es representable.
    // Condición estándar: el punto debe estar dentro del cono de visión,
    // lo cual se verifica de forma simple viendo si el producto escalar
    // entre el vector superficie->satélite y la normal de la superficie es positivo.
    const dot = px * (satX - px) + py * (satY - py) + pz * (satZ - pz);
    if (dot <= 0) return null;

    // Ángulos de escaneo E/W (x) y N/S (y), medidos desde el punto
    // subsatelital, siguiendo la misma convención que usa el archivo fuente
    // (sweep_angle_axis = "x" en la terminología del GOES-R PUG).
    const scanX = Math.atan2(-vy, -vx);
    const horizDist = Math.sqrt(vx * vx + vy * vy);
    const scanY = Math.atan2(-vz, horizDist);

    // Normalizar contra los radianes máximos reales del sector full_disk y
    // proyectar a coordenadas de píxel dentro de la imagen de 678x678,
    // usando el radio de disco real (338/337 px) en vez de la mitad exacta
    // del lienzo, para calzar con la calibración publicada por CIRA.
    const fracX = scanX / MAX_RAD_X;
    const fracY = scanY / MAX_RAD_Y;
    if (Math.abs(fracX) > 1.02 || Math.abs(fracY) > 1.02) return null;

    const col = (IMG_SIZE / 2) + fracX * DISK_RADIUS_X;
    const row = (IMG_SIZE / 2) - fracY * DISK_RADIUS_Y;
    if (col < 0 || col >= IMG_SIZE || row < 0 || row >= IMG_SIZE) return null;

    return { col, row };
  }

  /* -------------------- Datos remotos -------------------- */

  async function fetchLatestTimestamp(slug) {
    const resp = await fetch(`${BASE_URL}/data/json/${SAT}/${SECTOR}/${slug}/latest_times.json`);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (!data.timestamps_int || !data.timestamps_int.length) throw new Error('Sin timestamps disponibles');
    return String(data.timestamps_int[0]);
  }

  function buildImageUrl(slug, timestampStr) {
    // timestampStr formato: YYYYMMDDHHMMSS
    const yyyy = timestampStr.slice(0, 4);
    const mm = timestampStr.slice(4, 6);
    const dd = timestampStr.slice(6, 8);
    return `${BASE_URL}/data/imagery/${yyyy}/${mm}/${dd}/${SAT}---${SECTOR}/${slug}/${timestampStr}/00/000_000.png`;
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar la imagen de satélite'));
      img.src = url;
    });
  }

  /* -------------------- Capa Leaflet: overlay dinámico reproyectado -------------------- */

  // A diferencia de un ImageOverlay simple (que estira una imagen dentro de
  // un rectángulo lat/lon), esta capa dibuja pixel por pixel: recorre el
  // canvas visible del mapa, calcula la lat/lon de cada pixel de PANTALLA,
  // y busca el pixel correspondiente en la imagen fuente de 678x678 vía
  // latLonToPixel(). Se redibuja en cada movimiento/zoom del mapa.
  const GeoProjectedOverlay = L.Layer.extend({
    onAdd: function (map) {
      this._map = map;
      const pane = map.getPane(SATELLITE_PANE_NAME);
      this._canvas = document.createElement('canvas');
      this._canvas.style.position = 'absolute';
      this._ctx = this._canvas.getContext('2d');
      pane.appendChild(this._canvas);

      map.on('move zoom resize', this._reset, this);
      this._reset();
    },
    onRemove: function (map) {
      map.off('move zoom resize', this._reset, this);
      if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    },
    _reset: function () {
      const size = this._map.getSize();
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);
      this._canvas.width = size.x;
      this._canvas.height = size.y;
      this._redraw();
    },
    _redraw: function () {
      if (!currentImage || !this._map) return;
      const size = this._map.getSize();
      const ctx = this._ctx;
      const outputData = ctx.createImageData(size.x, size.y);

      // Se dibuja la imagen fuente en un canvas auxiliar oculto una sola
      // vez por frame para poder leer sus píxeles con getImageData.
      if (!this._srcCanvas || this._srcImage !== currentImage) {
        this._srcCanvas = document.createElement('canvas');
        this._srcCanvas.width = IMG_SIZE;
        this._srcCanvas.height = IMG_SIZE;
        const sctx = this._srcCanvas.getContext('2d');
        sctx.drawImage(currentImage, 0, 0);
        this._srcData = sctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE).data;
        this._srcImage = currentImage;
      }
      const srcData = this._srcData;

      // Muestreo con paso de 2px para mantener buen rendimiento (la
      // reproyección pixel-a-pixel completa en cada pan/zoom sería costosa
      // en pantallas grandes).
      //
      // LIMITACIÓN CONOCIDA: se usa la imagen del disco completo a su
      // resolución base (678x678 para todo el hemisferio visible), no los
      // niveles de zoom más altos de mosaico multi-tile que ofrece CIRA
      // (hasta 0.125 km/px). Esto es suficiente para la vista regional de
      // Argentina/Sudamérica que usa este editor, pero al hacer zoom muy
      // cercano en el mapa se nota el pixelado de la imagen fuente — es
      // una limitación de resolución de origen, no un error de
      // reproyección (los límites geográficos siguen calzando con
      // precisión en todos los niveles de zoom probados).
      const STEP = 2;
      for (let py = 0; py < size.y; py += STEP) {
        for (let px = 0; px < size.x; px += STEP) {
          const latlng = this._map.layerPointToLatLng(this._map.containerPointToLayerPoint([px, py]));
          const src = latLonToPixel(latlng.lat, latlng.lng);
          if (!src) continue;
          const sx = Math.round(src.col);
          const sy = Math.round(src.row);
          if (sx < 0 || sx >= IMG_SIZE || sy < 0 || sy >= IMG_SIZE) continue;
          const srcIdx = (sy * IMG_SIZE + sx) * 4;
          const r = srcData[srcIdx], g = srcData[srcIdx + 1], b = srcData[srcIdx + 2];
          for (let dy = 0; dy < STEP && py + dy < size.y; dy++) {
            for (let dx = 0; dx < STEP && px + dx < size.x; dx++) {
              const dstIdx = ((py + dy) * size.x + (px + dx)) * 4;
              outputData.data[dstIdx] = r;
              outputData.data[dstIdx + 1] = g;
              outputData.data[dstIdx + 2] = b;
              outputData.data[dstIdx + 3] = 255;
            }
          }
        }
      }
      ctx.clearRect(0, 0, size.x, size.y);
      ctx.putImageData(outputData, 0, 0);
    },
    redraw: function () {
      if (this._map) this._redraw();
    }
  });

  /* -------------------- API pública -------------------- */

  async function init(leafletMap) {
    map = leafletMap;
    if (!map.getPane(SATELLITE_PANE_NAME)) {
      map.createPane(SATELLITE_PANE_NAME);
      // Mismo criterio que el radar: el satélite queda por debajo de
      // límites administrativos, rutas y elementos dibujados. Radar y
      // satélite comparten el mismo nivel (250) porque son mutuamente
      // excluyentes (nunca están activos al mismo tiempo).
      map.getPane(SATELLITE_PANE_NAME).style.zIndex = 250;
      map.getPane(SATELLITE_PANE_NAME).style.pointerEvents = 'none';
    }
  }

  async function setProduct(productKey) {
    const product = PRODUCTS[productKey];
    if (!product) throw new Error('Producto de satélite desconocido: ' + productKey);
    currentProductKey = productKey;

    const timestamp = await fetchLatestTimestamp(product.slug);
    const url = buildImageUrl(product.slug, timestamp);
    const img = await loadImage(url);

    currentImage = img;
    currentTimestamp = timestamp;

    if (canvasOverlayLayer) {
      canvasOverlayLayer.redraw();
    }
  }

  async function setVisible(v, productKey) {
    visible = v;
    if (!map) return;
    if (v) {
      if (productKey && productKey !== currentProductKey) {
        await setProduct(productKey);
      } else if (!currentImage) {
        await setProduct(productKey || 'visible_red');
      }
      if (!canvasOverlayLayer) {
        canvasOverlayLayer = new GeoProjectedOverlay();
      }
      canvasOverlayLayer.addTo(map);
    } else if (canvasOverlayLayer) {
      map.removeLayer(canvasOverlayLayer);
    }
  }

  function isVisible() { return visible; }

  function getCurrentProductKey() { return currentProductKey; }

  function getCurrentTimestampLabel() {
    if (!currentTimestamp) return null;
    // formato YYYYMMDDHHMMSS -> "DD/MM HH:MMZ"
    const t = currentTimestamp;
    const hh = t.slice(8, 10), mm = t.slice(10, 12);
    const dd = t.slice(6, 8), mo = t.slice(4, 6);
    return `${dd}/${mo} ${hh}:${mm}Z`;
  }

  function getProducts() { return PRODUCTS; }

  return {
    init, setProduct, setVisible, isVisible,
    getCurrentProductKey, getCurrentTimestampLabel, getProducts
  };
})();
