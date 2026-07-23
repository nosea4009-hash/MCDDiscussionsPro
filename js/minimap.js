/* ==========================================================================
   minimap.js
   Mini mapa regional dentro del panel izquierdo (como en la esquina inferior
   izquierda de la imagen de referencia del SPC): muestra todo el país con
   un rectángulo sombreado indicando el área actualmente visible / el área
   de la discusión de mesoescala en el mapa principal.
   ========================================================================== */

const MiniMap = (function () {

  let miniMap = null;
  let mainMap = null;
  let extentRect = null;
  let mcdShadow = null; // shaded polygon mirroring the MCD area, like SPC inset

  async function init(mapMain) {
    mainMap = mapMain;

    miniMap = L.map('miniMap', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false
    });

    // fondo blanco simple + límites provinciales finos grises, como el inset del SPC
    const [provResp] = await Promise.all([fetch('data/provincias.json')]);
    const provData = await provResp.json();

    const provLayer = L.geoJSON(provData, {
      style: { color: '#666666', weight: 1, fill: true, fillColor: '#e6e6e6', fillOpacity: 1 }
    }).addTo(miniMap);

    miniMap.fitBounds(provLayer.getBounds(), { padding: [4, 4] });
    miniMap.setMaxBounds(provLayer.getBounds().pad(0.3));

    extentRect = L.rectangle(mainMap.getBounds(), {
      color: '#000000', weight: 1.5, fill: true, fillColor: '#808080', fillOpacity: 0.45, className: 'mm-extent-rect'
    }).addTo(miniMap);

    mainMap.on('moveend zoomend', updateExtentRect);
    updateExtentRect();

    // Fix leaflet sizing issue when container was hidden/resized
    setTimeout(() => miniMap.invalidateSize(), 200);
    window.addEventListener('resize', () => miniMap.invalidateSize());
  }

  function updateExtentRect() {
    if (!extentRect || !mainMap) return;
    extentRect.setBounds(mainMap.getBounds());
  }

  // Called whenever the MCD polygon changes, to mirror it (shaded) on the inset,
  // matching the SPC style where the small inset shows a grey shaded blob of the
  // threat area over the state outlines.
  function setMcdShape(latlngs) {
    if (!miniMap) return;
    if (mcdShadow) { miniMap.removeLayer(mcdShadow); mcdShadow = null; }
    if (!latlngs || !latlngs.length) return;
    mcdShadow = L.polygon(latlngs, {
      color: '#000000', weight: 1, fill: true, fillColor: '#808080', fillOpacity: 0.6
    }).addTo(miniMap);
  }

  function invalidate() {
    if (miniMap) miniMap.invalidateSize();
  }

  return { init, setMcdShape, invalidate };
})();
