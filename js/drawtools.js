/* ==========================================================================
   drawtools.js
   Motor de dibujo del editor MCD: maneja todas las herramientas disponibles
   en la barra superior (área MCD, contornos de color, hatch, frentes,
   isobaras, centros L/H) construidas sobre Leaflet + Leaflet.draw a bajo
   nivel (usamos los handlers internos de L.Draw.Polyline/Polygon).

   Cada elemento creado se registra en `DrawTools.items` con metadata para
   poder seleccionarlo, editarlo (colores, texto, grosor) y borrarlo.
   ========================================================================== */

const DrawTools = (function () {

  let map = null;
  let currentTool = null;
  let activeHandler = null;
  let items = [];      // { id, kind, obj, layer(s) }
  let selectedItem = null;
  let itemSeq = 1;

  function init(leafletMap) {
    map = leafletMap;
    map.on(L.Draw.Event.CREATED, onShapeCreated);

    map.on('click', function (e) {
      // deselect if clicking empty map area while not in a drawing tool
      if (!currentTool) {
        selectItem(null);
      }
    });
  }

  function setTool(toolName) {
    stopActiveHandler();
    currentTool = toolName;
    document.querySelectorAll('.tb-btn[data-tool]').forEach(b => b.classList.remove('active'));
    if (toolName) {
      const btn = document.querySelector(`.tb-btn[data-tool="${toolName}"]`);
      if (btn) btn.classList.add('active');
    }
    if (!toolName) return;

    if (toolName === 'mcd-polygon' || toolName === 'contour-polygon' || toolName === 'hatch-polygon') {
      activeHandler = new L.Draw.Polygon(map, { shapeOptions: { color: '#000', weight: 3, fill: true, fillOpacity: 0.15 }, showArea: false });
      activeHandler.enable();
    } else if (['front-warm','front-cold','front-stationary','front-occluded','dryline','trough','isobar'].includes(toolName)) {
      activeHandler = new L.Draw.Polyline(map, { shapeOptions: { color: '#000', weight: 3 } });
      activeHandler.enable();
    } else if (toolName === 'marker-L' || toolName === 'marker-H') {
      map.once('click', function (e) {
        addPressureCenter(e.latlng, toolName === 'marker-L' ? 'L' : 'H');
        setTool(null);
      });
    } else if (toolName === 'textbox') {
      FloatingBoxes.createAt(200, 200);
      setTool(null);
    } else if (toolName === 'label') {
      map.once('click', function (e) {
        addFreeLabel(e.latlng);
        setTool(null);
      });
    }
  }

  function stopActiveHandler() {
    if (activeHandler) {
      try { activeHandler.disable(); } catch (e) {}
      activeHandler = null;
    }
  }

  // Herramientas cuya área de dibujo está restringida a Argentina, Paraguay
  // y Uruguay (a pedido: sólo se pueden crear Áreas MCD y Contornos de
  // color dentro de esos 3 países).
  const REGION_RESTRICTED_TOOLS = ['mcd-polygon', 'contour-polygon'];

  function onShapeCreated(e) {
    const layer = e.layer;
    const tool = currentTool;
    setTool(null); // exit draw mode after one shape, user can re-click tool button

    if (REGION_RESTRICTED_TOOLS.includes(tool) && !RegionMask.intersectsAllowedRegion(layer.getLatLngs())) {
      alert('Esta herramienta sólo se puede usar dentro de Argentina, Paraguay o Uruguay. El área dibujada quedó completamente fuera de esos países y no fue creada.');
      return;
    }

    if (tool === 'mcd-polygon') {
      addMcdPolygon(layer.getLatLngs());
    } else if (tool === 'contour-polygon') {
      addContourPolygon(layer.getLatLngs(), randomVividColor());
    } else if (tool === 'hatch-polygon') {
      addHatchPolygon(layer.getLatLngs(), '#ff0000');
    } else if (['front-warm','front-cold','front-stationary','front-occluded','dryline','trough','isobar'].includes(tool)) {
      addFront(layer.getLatLngs(), tool);
    }
  }

  function randomVividColor() {
    const colors = ['#ff0000', '#00a000', '#0060ff', '#ff9900', '#a020f0', '#00c8c8'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /* ---------------- Item registry helpers ---------------- */

  function registerItem(kind, obj, clickableLayer) {
    const id = 'item_' + (itemSeq++);
    const record = { id, kind, obj };
    items.push(record);
    if (clickableLayer) {
      clickableLayer.on('click', function (ev) {
        L.DomEvent.stopPropagation(ev);
        selectItem(record);
      });
    }
    return record;
  }

  function findItemByLayer(layer) {
    return items.find(it => it.obj.layer === layer || it.obj.outline === layer);
  }

  function selectItem(record) {
    if (selectedItem) {
      // remove highlight
      if (selectedItem.obj._highlightOff) selectedItem.obj._highlightOff();
      if (selectedItem.obj.stopVertexEdit) selectedItem.obj.stopVertexEdit();
    }
    selectedItem = record;
    if (record) {
      if (record.obj._highlightOn) record.obj._highlightOn();
      if (record.obj.startVertexEdit) record.obj.startVertexEdit();
    }
    StyleEditor.showFor(record);
  }

  function getSelectedItem() { return selectedItem; }

  function deleteSelected() {
    if (!selectedItem) return;
    selectedItem.obj.remove();
    items = items.filter(it => it !== selectedItem);
    selectedItem = null;
    StyleEditor.hide();
  }

  function clearAll() {
    items.forEach(it => it.obj.remove());
    items = [];
    selectedItem = null;
    StyleEditor.hide();
  }

  /* ---------------- MCD polygon (black bold outline, like the watch box) ---------------- */

  function addMcdPolygon(latlngs, opts) {
    opts = opts || {};
    const poly = L.polygon(latlngs, {
      color: '#000000',
      weight: opts.weight || 4.5,
      opacity: 1,
      fill: true,
      fillOpacity: 0,
      interactive: true
    });
    poly.addTo(map);

    const obj = {
      type: 'mcd-polygon',
      layer: poly,
      setWeight(w) { poly.setStyle({ weight: w }); },
      setLatLngs(ll) { poly.setLatLngs(ll); },
      remove() { map.removeLayer(poly); },
      _highlightOn() { poly.setStyle({ color: '#0060ff' }); },
      _highlightOff() { poly.setStyle({ color: '#000000' }); }
    };
    enablePolygonEditing(poly, obj);
    const rec = registerItem('mcd-polygon', obj, poly);
    selectItem(rec);
    return rec;
  }

  /* ---------------- Contour polygon (custom RGB fill/border + thin black outer stroke) ---------------- */

  function addContourPolygon(latlngs, color, opts) {
    opts = opts || {};
    const fillOpacity = opts.fillOpacity != null ? opts.fillOpacity : 0.12;
    let fillEnabled = opts.fillEnabled != null ? opts.fillEnabled : true;

    // outer thin black stroke (drawn slightly larger via a second polygon underneath isn't accurate geodesically,
    // so instead we render an outline pass using two stacked polygons: black thin outline behind, color polygon above with own border)
    const blackOutline = L.polygon(latlngs, {
      color: '#000000', weight: 5, opacity: 1, fill: false, interactive: false
    });
    const colorPoly = L.polygon(latlngs, {
      color: color, weight: 2.6, opacity: 1, fill: fillEnabled, fillColor: color, fillOpacity: fillEnabled ? fillOpacity : 0, interactive: true
    });
    blackOutline.addTo(map);
    colorPoly.addTo(map);

    const obj = {
      type: 'contour-polygon',
      layer: colorPoly,
      outline: blackOutline,
      color,
      fillOpacity,
      get fillEnabled() { return fillEnabled; },
      setColor(c) { color = c; colorPoly.setStyle({ color: c, fillColor: c }); },
      setFillOpacity(o) { fillOpacity = o; if (fillEnabled) colorPoly.setStyle({ fillOpacity: o }); },
      setFillEnabled(enabled) {
        fillEnabled = enabled;
        colorPoly.setStyle({ fill: enabled, fillOpacity: enabled ? fillOpacity : 0 });
      },
      setLatLngs(ll) { colorPoly.setLatLngs(ll); blackOutline.setLatLngs(ll); },
      remove() { map.removeLayer(colorPoly); map.removeLayer(blackOutline); },
      _highlightOn() { blackOutline.setStyle({ color: '#ffff00', weight: 6 }); },
      _highlightOff() { blackOutline.setStyle({ color: '#000000', weight: 5 }); }
    };
    enablePolygonEditing(colorPoly, obj, blackOutline);
    const rec = registerItem('contour-polygon', obj, colorPoly);
    selectItem(rec);
    return rec;
  }

  /* ---------------- Hatch polygon (SVG stripe pattern, customizable color) ---------------- */

  function addHatchPolygon(latlngs, color, opts) {
    opts = opts || {};
    const pattern = new L.StripePattern({
      weight: opts.weight || 3,
      spaceWeight: opts.spaceWeight || 6,
      color: color,
      opacity: 1,
      spaceOpacity: 0,
      angle: opts.angle != null ? opts.angle : 45
    });
    pattern.addTo(map);

    const poly = L.polygon(latlngs, {
      color: color, weight: 2, opacity: 1, fillPattern: pattern, fill: true, interactive: true
    });
    poly.addTo(map);

    const obj = {
      type: 'hatch-polygon',
      layer: poly,
      pattern,
      color,
      angle: opts.angle != null ? opts.angle : 45,
      setColor(c) {
        color = c;
        pattern.options.color = c;
        pattern.redraw();
        poly.setStyle({ color: c });
      },
      setAngle(a) {
        this.angle = a;
        pattern.options.angle = a;
        pattern.redraw();
      },
      setLatLngs(ll) { poly.setLatLngs(ll); },
      remove() { map.removeLayer(poly); map.removePattern && map.removePattern(pattern); },
      _highlightOn() { poly.setStyle({ weight: 4, color: '#ffff00' }); },
      _highlightOff() { poly.setStyle({ weight: 2, color: color }); }
    };
    enablePolygonEditing(poly, obj);
    const rec = registerItem('hatch-polygon', obj, poly);
    selectItem(rec);
    return rec;
  }

  /* ---------------- Fronts (warm/cold/stationary/occluded/dryline/trough/isobar) ---------------- */

  function addFront(latlngs, type, color, altColor) {
    const front = FrontSymbols.createFront(map, latlngs, type, color, altColor);
    front._highlightOn = function () { front.layer.setStyle({ weight: 6 }); };
    front._highlightOff = function () { front.layer.setStyle({ weight: 3.4 }); };
    const rec = registerItem('front', front, front.layer);
    selectItem(rec);
    return rec;
  }

  /* ---------------- Pressure centers (L/H) ---------------- */

  function addPressureCenter(latlng, letter, color) {
    color = color || (letter === 'L' ? '#ff0000' : '#0000ff');
    const pm = PressureMarkers.create(map, latlng, letter, color);
    pm._highlightOn = function () { pm.layer.getElement() && (pm.layer.getElement().style.filter = 'drop-shadow(0 0 4px #0060ff)'); };
    pm._highlightOff = function () { pm.layer.getElement() && (pm.layer.getElement().style.filter = ''); };
    const rec = registerItem('pressure', pm, pm.layer);
    selectItem(rec);
    return rec;
  }

  /* ---------------- Free text label on the map ---------------- */

  function addFreeLabel(latlng) {
    const icon = L.divIcon({
      className: 'map-free-label',
      html: `<div contenteditable="true" style="font-weight:bold;font-size:13px;font-family:Arial,Helvetica,sans-serif;color:#000;background:rgba(255,255,255,0.85);padding:2px 5px;border:1px solid #000;white-space:nowrap;">Texto</div>`,
      iconSize: null,
      iconAnchor: [0, 0]
    });
    const marker = L.marker(latlng, { icon, draggable: true, interactive: true });
    marker.addTo(map);
    const obj = {
      type: 'free-label',
      layer: marker,
      setColor(c) {
        const el = marker.getElement();
        if (el) { const d = el.querySelector('div'); if (d) d.style.color = c; }
      },
      remove() { map.removeLayer(marker); },
      _highlightOn() {},
      _highlightOff() {}
    };
    const rec = registerItem('free-label', obj, marker);
    selectItem(rec);
    return rec;
  }

  /* ---------------- Vertex editing for polygons (drag existing vertices) ---------------- */

  function enablePolygonEditing(poly, obj, mirrorLayer) {
    // Leaflet core doesn't include vertex editing without leaflet-draw's Edit handlers,
    // which require being part of a FeatureGroup managed by EditToolbar. For simplicity
    // and reliability we implement a light-weight custom vertex editor activated on demand.
    obj.startVertexEdit = function () {
      clearVertexHandles();
      const latlngs = poly.getLatLngs()[0];
      const handles = latlngs.map((ll, idx) => {
        const h = L.circleMarker(ll, {
          radius: 5, color: '#000', weight: 1, fillColor: '#ffff00', fillOpacity: 1, interactive: true
        }).addTo(map);
        makeHandleDraggable(h, function (newLatLng) {
          latlngs[idx] = newLatLng;
          poly.setLatLngs([latlngs]);
          if (mirrorLayer) mirrorLayer.setLatLngs([latlngs]);
        });
        return h;
      });
      obj._vertexHandles = handles;
    };
    obj.stopVertexEdit = function () {
      clearVertexHandles();
    };
    function clearVertexHandles() {
      if (obj._vertexHandles) {
        obj._vertexHandles.forEach(h => map.removeLayer(h));
        obj._vertexHandles = null;
      }
    }
  }

  function makeHandleDraggable(circleMarker, onMove) {
    let dragging = false;
    circleMarker.on('mousedown', function (e) {
      dragging = true;
      map.dragging.disable();
      L.DomEvent.stop(e);
    });
    map.on('mousemove', function (e) {
      if (!dragging) return;
      circleMarker.setLatLng(e.latlng);
      onMove(e.latlng);
    });
    map.on('mouseup', function () {
      if (dragging) {
        dragging = false;
        map.dragging.enable();
      }
    });
  }

  return {
    init, setTool, deleteSelected, clearAll,
    addMcdPolygon, addContourPolygon, addHatchPolygon, addFront, addPressureCenter, addFreeLabel,
    getSelectedItem, selectItem,
    get items() { return items; }
  };
})();
