/* ==========================================================================
   symbols.js
   Simbología meteorológica clásica estilo SPC/NWS: frentes (cálido, frío,
   estacionario, ocluido), dryline, vaguada (trough) e isobaras.
   Usa Leaflet.PolylineDecorator para colocar triángulos / semicírculos
   repetidos a lo largo de la polilínea.
   ========================================================================== */

const FrontSymbols = (function () {

  function triangleDivIcon(color, size) {
    size = size || 14;
    return L.divIcon({
      className: 'front-symbol-icon',
      html: `<div style="
        width:0;height:0;
        border-top:${size/2}px solid transparent;
        border-bottom:${size/2}px solid transparent;
        border-left:${size}px solid ${color};
        filter: drop-shadow(0 0 0.5px #000);
      "></div>`,
      iconSize: [size, size],
      iconAnchor: [0, size/2]
    });
  }

  function semicircleDivIcon(color, size) {
    size = size || 14;
    return L.divIcon({
      className: 'front-symbol-icon',
      html: `<div style="
        width:${size}px;height:${size/2}px;
        border-radius:${size}px ${size}px 0 0;
        background:${color};
        border:1px solid ${color};
      "></div>`,
      iconSize: [size, size/2],
      iconAnchor: [0, size/2]
    });
  }

  function dashSymbol(color, weight) {
    return L.Symbol.dash({
      pixelSize: 8,
      pathOptions: { color: color, weight: weight || 3, opacity: 1 }
    });
  }

  // Construye la lista de "patterns" para polylineDecorator según tipo de frente.
  function buildPatterns(type, color, altColor) {
    const repeat = 22;
    switch (type) {
      case 'front-warm':
        return [{
          offset: 8, repeat: repeat,
          symbol: L.Symbol.marker({ rotate: true, markerOptions: { icon: semicircleDivIcon(color || '#ff0000', 14) } })
        }];
      case 'front-cold':
        return [{
          offset: 8, repeat: repeat,
          symbol: L.Symbol.marker({ rotate: true, markerOptions: { icon: triangleDivIcon(color || '#0000ff', 14) } })
        }];
      case 'front-occluded':
        return [{
          offset: 8, repeat: repeat * 2,
          symbol: L.Symbol.marker({ rotate: true, markerOptions: { icon: triangleDivIcon(color || '#a020f0', 14) } })
        }, {
          offset: 8 + repeat, repeat: repeat * 2,
          symbol: L.Symbol.marker({ rotate: true, markerOptions: { icon: semicircleDivIcon(altColor || color || '#a020f0', 14) } })
        }];
      case 'front-stationary':
        return [{
          offset: 8, repeat: repeat * 2,
          symbol: L.Symbol.marker({ rotate: true, markerOptions: { icon: triangleDivIcon(altColor || '#0000ff', 14) } })
        }, {
          offset: 8 + repeat, repeat: repeat * 2,
          symbol: L.Symbol.marker({ rotate: true, markerOptions: { icon: semicircleDivIcon(color || '#ff0000', 14) } })
        }];
      case 'dryline':
        return [{
          offset: 8, repeat: repeat,
          symbol: L.Symbol.marker({ rotate: true, markerOptions: { icon: semicircleDivIcon(color || '#ff8c00', 12) } })
        }];
      case 'trough':
        // Vaguada: sólo línea discontinua, sin símbolos repetidos (se maneja con dashArray en el estilo de línea)
        return [];
      case 'isobar':
        return [];
      default:
        return [];
    }
  }

  function baseLineStyle(type, color) {
    switch (type) {
      case 'front-warm': return { color: color || '#ff0000', weight: 3.4, opacity: 1 };
      case 'front-cold': return { color: color || '#0000ff', weight: 3.4, opacity: 1 };
      case 'front-occluded': return { color: color || '#a020f0', weight: 3.4, opacity: 1 };
      case 'front-stationary': return { color: color || '#ff0000', weight: 3.4, opacity: 1, dashArray: null };
      case 'dryline': return { color: color || '#ff8c00', weight: 3, opacity: 1, dashArray: '1,10' };
      case 'trough': return { color: color || '#8b5a2b', weight: 3, opacity: 1, dashArray: '10,6' };
      case 'isobar': return { color: color || '#333333', weight: 1.4, opacity: 0.9 };
      default: return { color: color || '#000000', weight: 3, opacity: 1 };
    }
  }

  const LABELS = {
    'front-warm': 'Frente Cálido',
    'front-cold': 'Frente Frío',
    'front-occluded': 'Frente Ocluido',
    'front-stationary': 'Frente Estacionario',
    'dryline': 'Dryline',
    'trough': 'Vaguada',
    'isobar': 'Isobara'
  };

  // Crea un objeto "front feature" completo: polyline + decorator, con métodos
  // para actualizar color / tipo / eliminar.
  function createFront(map, latlngs, type, color, altColor) {
    const style = baseLineStyle(type, color);
    const line = L.polyline(latlngs, Object.assign({}, style, { interactive: true }));
    line.addTo(map);

    let decorator = null;
    function rebuildDecorator() {
      if (decorator) { map.removeLayer(decorator); decorator = null; }
      const patterns = buildPatterns(type, color, altColor);
      if (patterns.length) {
        decorator = L.polylineDecorator(line, { patterns: patterns });
        decorator.addTo(map);
      }
    }
    rebuildDecorator();

    return {
      type: 'front',
      frontType: type,
      layer: line,
      get color() { return color; },
      setColor(c) { color = c; line.setStyle(baseLineStyle(type, c)); rebuildDecorator(); },
      setAltColor(c) { altColor = c; rebuildDecorator(); },
      setFrontType(t) { type = t; line.setStyle(baseLineStyle(type, color)); rebuildDecorator(); },
      setLatLngs(ll) { line.setLatLngs(ll); rebuildDecorator(); },
      remove() { if (decorator) map.removeLayer(decorator); map.removeLayer(line); },
      label() { return LABELS[type] || type; }
    };
  }

  return { createFront, LABELS, triangleDivIcon, semicircleDivIcon };
})();


/* ==========================================================================
   H / L pressure center markers
   ========================================================================== */
const PressureMarkers = (function () {
  function makeIcon(letter, color) {
    return L.divIcon({
      className: 'hl-marker-label',
      html: `<div style="color:${color};">${letter}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  function create(map, latlng, letter, color) {
    const marker = L.marker(latlng, { icon: makeIcon(letter, color), draggable: true, interactive: true });
    marker.addTo(map);
    return {
      type: 'pressure',
      letter,
      layer: marker,
      get color() { return color; },
      setColor(c) { color = c; marker.setIcon(makeIcon(letter, c)); },
      setLetter(l) { letter = l; marker.setIcon(makeIcon(l, color)); },
      remove() { map.removeLayer(marker); }
    };
  }

  return { create };
})();
