/* ==========================================================================
   metar.js
   Plots de observaciones de superficie (estilo METAR / station model)
   usando datos abiertos del Servicio Meteorológico Nacional (SMN) de
   Argentina: https://www.smn.gob.ar/descarga-de-datos

   El SMN publica un ZIP con un TXT de "tiempo actual" (dato=tiepre) vía:
     https://ssl.smn.gob.ar/dpd/zipopendata.php?dato=tiepre
   Ese endpoint responde con CORS abierto (Access-Control-Allow-Origin: *),
   por lo que se puede consumir directamente desde el navegador. El ZIP se
   descomprime en el cliente con JSZip.

   Cada línea trae: Estación;Fecha;Hora;Estado del cielo;Visibilidad;
   Temperatura;Sensación térmica;Humedad;Viento (dirección + veloc. km/h);
   Presión.

   Las coordenadas de cada estación se resuelven contra
   data/estaciones_smn.json (generado a partir del listado oficial de
   estaciones del SMN).
   ========================================================================== */

const MetarLayer = (function () {

  const SMN_URL = 'https://ssl.smn.gob.ar/dpd/zipopendata.php?dato=tiepre';

  // El endpoint del SMN responde con la cabecera "control-allow-origin: *"
  // en lugar de "Access-Control-Allow-Origin: *" (falta el prefijo
  // "Access-"), por lo que los navegadores bloquean el fetch() directo por
  // CORS aunque el servidor sí intente permitir el acceso. Como bypass se
  // usa un proxy CORS público que reenvía la respuesta agregando el header
  // correcto. Si el proxy falla, se informa el error al usuario.
  const CORS_PROXY = 'https://proxy.cors.sh/';
  const ZIP_URL = CORS_PROXY + SMN_URL;

  const WIND_DEG = {
    'NORTE': 0, 'NORESTE': 45, 'ESTE': 90, 'SUDESTE': 135, 'SURESTE': 135,
    'SUR': 180, 'SUDOESTE': 225, 'SUROESTE': 225, 'OESTE': 270, 'NOROESTE': 315,
    'CALMA': null
  };

  let map = null;
  let stations = null;      // array from data/estaciones_smn.json
  let stationsByName = null; // Map normalizado -> station
  let markersGroup = null;

  function normalize(str) {
    return (str || '')
      .toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
      .trim();
  }

  async function loadStations() {
    if (stations) return;
    const resp = await fetch('data/estaciones_smn.json');
    stations = await resp.json();
    stationsByName = new Map();
    stations.forEach(function (s) {
      stationsByName.set(normalize(s.nombre), s);
    });
  }

  function findStation(rawName) {
    const norm = normalize(rawName);
    if (stationsByName.has(norm)) return stationsByName.get(norm);
    if (stationsByName.has(norm + ' AERO')) return stationsByName.get(norm + ' AERO');
    // algunas estaciones se listan sin "AERO" en el TXT pero con "OBSERVATORIO"/"UNIVERSIDAD", etc.
    for (const key of stationsByName.keys()) {
      if (key.startsWith(norm)) return stationsByName.get(key);
    }
    return null;
  }

  // Aproximación de punto de rocío (fórmula de Magnus-Tetens) a partir de
  // temperatura (°C) y humedad relativa (%).
  function dewPoint(tempC, rh) {
    if (tempC == null || rh == null || isNaN(tempC) || isNaN(rh) || rh <= 0) return null;
    const a = 17.27, b = 237.7;
    const alpha = Math.log(rh / 100) + (a * tempC) / (b + tempC);
    return (b * alpha) / (a - alpha);
  }

  function parseWind(str) {
    if (!str) return { dir: null, speed: 0 };
    const norm = normalize(str);
    if (norm.indexOf('CALMA') !== -1) return { dir: null, speed: 0 };
    const m = norm.match(/^([A-ZÑ]+)\s+(\d+)/);
    if (!m) return { dir: null, speed: 0 };
    const dirText = m[1];
    const speed = parseInt(m[2], 10);
    const dir = WIND_DEG.hasOwnProperty(dirText) ? WIND_DEG[dirText] : null;
    return { dir, speed };
  }

  async function fetchAndParse() {
    const resp = await fetch(ZIP_URL);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const buf = await resp.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const fileNames = Object.keys(zip.files);
    if (!fileNames.length) throw new Error('ZIP vacío');
    const fileData = await zip.files[fileNames[0]].async('uint8array');
    const text = new TextDecoder('iso-8859-1').decode(fileData);

    const lines = text.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(Boolean);
    const observations = [];
    for (const line of lines) {
      const parts = line.split(';').map(p => p.trim());
      if (parts.length < 9) continue;
      const [nombre, fecha, hora, estado, visibilidad, tempStr, sensStr, humStr, vientoStr, presionRaw] = parts;
      const station = findStation(nombre);
      if (!station) continue;

      const temp = parseFloat(tempStr.replace(',', '.'));
      const hum = parseInt(humStr, 10);
      const wind = parseWind(vientoStr);
      const presion = parseFloat((presionRaw || '').split('/')[0].trim().replace(',', '.'));
      const td = dewPoint(temp, hum);

      observations.push({
        nombre, fecha, hora, estado, visibilidad,
        temp: isNaN(temp) ? null : temp,
        sensacion: sensStr && sensStr.toLowerCase().indexOf('no se calcula') === -1 ? parseFloat(sensStr.replace(',', '.')) : null,
        humedad: isNaN(hum) ? null : hum,
        dewpoint: td,
        wind,
        presion: isNaN(presion) ? null : presion,
        lat: station.lat,
        lon: station.lon
      });
    }
    return observations;
  }

  function windArrowHtml(dir, speed) {
    if (dir == null || speed === 0) {
      return `<div class="metar-calm">o</div>`;
    }
    // La flecha "apunta hacia donde viene el viento", estilo estación clásica:
    // se rota según la dirección de procedencia.
    return `<div class="metar-arrow" style="transform:rotate(${dir}deg);">&#8593;</div>`;
  }

  function makeStationIcon(obs) {
    const tempTxt = obs.temp != null ? Math.round(obs.temp) : '--';
    const dewTxt = obs.dewpoint != null ? Math.round(obs.dewpoint) : '--';
    const presTxt = obs.presion != null ? Math.round(obs.presion * 10) % 1000 : '---';
    const windTxt = obs.wind.speed ? Math.round(obs.wind.speed) : '0';

    const html = `
      <div class="metar-plot">
        <div class="metar-temp">${tempTxt}</div>
        <div class="metar-pres">${presTxt}</div>
        <div class="metar-center">${windArrowHtml(obs.wind.dir, obs.wind.speed)}</div>
        <div class="metar-dew">${dewTxt}</div>
        <div class="metar-wspd">${windTxt}</div>
      </div>`;
    return L.divIcon({
      className: 'metar-icon',
      html: html,
      iconSize: [46, 46],
      iconAnchor: [23, 23]
    });
  }

  function tooltipHtml(obs) {
    return `<b>${obs.nombre}</b><br>` +
      `${obs.fecha} ${obs.hora}<br>` +
      `${obs.estado}<br>` +
      `Temp: ${obs.temp != null ? obs.temp + '°C' : 'N/D'} · ` +
      `PR: ${obs.dewpoint != null ? Math.round(obs.dewpoint) + '°C' : 'N/D'}<br>` +
      `Hum: ${obs.humedad != null ? obs.humedad + '%' : 'N/D'}<br>` +
      `Viento: ${obs.wind.speed} km/h<br>` +
      `Presión: ${obs.presion != null ? obs.presion + ' hPa' : 'N/D'}`;
  }

  async function load(leafletMap) {
    map = leafletMap;
    await loadStations();
    const observations = await fetchAndParse();

    if (markersGroup) { map.removeLayer(markersGroup); markersGroup = null; }
    markersGroup = L.layerGroup();
    observations.forEach(function (obs) {
      const marker = L.marker([obs.lat, obs.lon], { icon: makeStationIcon(obs), interactive: true });
      marker.bindTooltip(tooltipHtml(obs), { direction: 'top' });
      markersGroup.addLayer(marker);
    });
    markersGroup.addTo(map);
    return observations.length;
  }

  function clear() {
    if (markersGroup && map) { map.removeLayer(markersGroup); markersGroup = null; }
  }

  return { load, clear };
})();
