/* ==========================================================================
   export.js
   Exportación de la discusión completa (panel + mapa + cajas flotantes) a
   una imagen PNG usando html2canvas.

   El panel lateral (#spc-panel) tiene scroll interno (overflow-y: auto)
   porque su contenido puede ser más alto que la ventana del navegador. El
   mapa (#map-wrapper), en cambio, siempre debe capturarse tal cual se ve
   en pantalla (con el pan/zoom actual). Por eso el panel y el mapa se
   capturan por SEPARADO —el panel usando su altura de contenido completa,
   sin importar cuánto haya que hacer scroll para verlo todo— y luego se
   combinan en un único canvas final. Esto evita que la tabla de
   intensidad, "Fields Plotted" o el mini mapa queden cortados en la
   exportación cuando la ventana del navegador es baja.
   ========================================================================== */

const ExportTool = (function () {

  function init() {
    const btn = document.getElementById('btnExport');
    if (!btn) return;
    btn.addEventListener('click', doExport);
  }

  // La mayoría de los navegadores rechazan crear un <canvas> si alguna de
  // sus dimensiones supera un límite interno (típicamente entre 16.384 y
  // 32.767 px de lado, según el navegador) o si el área total (ancho ×
  // alto) supera unos ~268 millones de píxeles ("At least one of the image
  // dimensions exceed max allowed size"). Para evitarlo, se calcula
  // automáticamente la escala más alta posible sin pasarse de un límite
  // seguro, en base al tamaño real de lo que se va a capturar.
  const MAX_CANVAS_SIDE = 8000;      // margen conservador respecto al límite real del navegador
  const MAX_CANVAS_AREA = 40000000;  // ~40 megapíxeles, de sobra para imprimir/compartir

  function computeSafeScale(widthPx, heightPx, desiredScale) {
    let scale = desiredScale;
    if (widthPx * scale > MAX_CANVAS_SIDE) scale = Math.min(scale, MAX_CANVAS_SIDE / widthPx);
    if (heightPx * scale > MAX_CANVAS_SIDE) scale = Math.min(scale, MAX_CANVAS_SIDE / heightPx);
    if (widthPx * heightPx * scale * scale > MAX_CANVAS_AREA) {
      scale = Math.min(scale, Math.sqrt(MAX_CANVAS_AREA / (widthPx * heightPx)));
    }
    return Math.max(0.5, Math.min(scale, desiredScale));
  }

  async function doExport() {
    const btn = document.getElementById('btnExport');
    const originalLabel = btn ? btn.textContent : null;
    if (btn) { btn.textContent = '⏳ Generando…'; btn.disabled = true; }

    const panelEl = document.getElementById('spc-panel');
    const mapWrapperEl = document.getElementById('map-wrapper');

    // html2canvas no interpreta correctamente los paneles de Leaflet que están
    // posicionados con `transform: translate3d(...)` (usado al hacer pan/zoom).
    // Esto provoca que el área exportada aparezca desplazada respecto de lo
    // que se ve en pantalla (ej. se exporta la costa de Buenos Aires en vez
    // del área enfocada). La solución es "congelar" temporalmente esas capas:
    // convertimos el transform activo en un offset de left/top absoluto justo
    // antes de capturar, y lo restauramos después.
    const frozen = freezeLeafletTransforms();

    let panelRestore = null;

    try {
      const desiredScale = 2;

      // IMPORTANTE: el mapa se captura ANTES de expandir el panel lateral.
      // #main-layout es un contenedor flex con alineación "stretch" por
      // defecto: si se agranda la altura del panel para mostrar todo su
      // contenido (tabla de intensidad, fields plotted, mini mapa) sin
      // scroll, el navegador también estira #map-wrapper por ser su
      // hermano flex — pero Leaflet nunca se entera de ese cambio de
      // tamaño (no se llama invalidateSize), así que sus tiles y capas
      // quedan dibujados sólo en la porción superior original, dejando el
      // resto de la imagen exportada en blanco. Capturando el mapa primero
      // se evita por completo ese problema.
      //
      // NOTA: a diferencia del panel, aquí NO se pasan `width`/`height`/
      // `windowWidth`/`windowHeight` — html2canvas ya usa el tamaño real
      // del elemento en pantalla, y combinar esos parámetros explícitos
      // con `scale` provoca que sólo se renderice la esquina superior
      // izquierda del canvas final (el resto queda en blanco), un
      // comportamiento conocido de html2canvas al duplicar el efecto de
      // escala. Sólo se necesita fijar esos parámetros para el panel, que
      // sí debe expandirse más allá de su tamaño visible en pantalla.
      const mapRect = { width: mapWrapperEl.clientWidth, height: mapWrapperEl.clientHeight };
      const mapScale = computeSafeScale(mapRect.width, mapRect.height, desiredScale);

      const mapCanvas = await html2canvas(mapWrapperEl, {
        useCORS: true,
        allowTaint: false,
        scale: mapScale,
        backgroundColor: '#ffffff'
      });

      // Ahora sí se expande el panel a su altura de contenido completa
      // (sin scroll) para capturarlo por separado.
      panelRestore = expandPanelFully(panelEl);
      const panelRect = { width: panelEl.scrollWidth, height: panelEl.scrollHeight };
      const panelScale = computeSafeScale(panelRect.width, panelRect.height, desiredScale);

      const panelCanvas = await html2canvas(panelEl, {
        useCORS: true,
        allowTaint: false,
        scale: panelScale,
        backgroundColor: getComputedStyle(panelEl).backgroundColor || '#ffffff',
        scrollX: 0,
        scrollY: 0,
        width: panelRect.width,
        height: panelRect.height,
        windowWidth: panelRect.width,
        windowHeight: panelRect.height
      });

      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = panelCanvas.width + mapCanvas.width;
      finalCanvas.height = Math.max(panelCanvas.height, mapCanvas.height);
      const ctx = finalCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
      ctx.drawImage(panelCanvas, 0, 0);
      ctx.drawImage(mapCanvas, panelCanvas.width, 0);

      const link = document.createElement('a');
      const mcdNum = document.getElementById('mcdNumber').textContent.trim() || 'MCD';
      link.download = `MCD_${mcdNum}_Argentina.png`;
      link.href = finalCanvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Error exportando PNG:', err);
      const msg = (err && err.message) || '';
      if (msg.toLowerCase().indexOf('exceed max allowed size') !== -1) {
        alert('La imagen resultante era demasiado grande para generarla en el navegador. Probá hacer zoom out en el mapa antes de exportar, y volvé a intentar.');
      } else {
        alert('No se pudo exportar la imagen. Es posible que algún mapa base bloquee la exportación por CORS. Probá con el mapa "Estilo Cartopy" o "Sin mapa base" para exportar sin problemas.');
      }
    } finally {
      if (panelRestore) panelRestore();
      unfreezeLeafletTransforms(frozen);
      if (btn) { btn.textContent = originalLabel; btn.disabled = false; }
    }
  }

  // Quita temporalmente el scroll interno del panel y lo deja crecer a su
  // altura de contenido completa, para que html2canvas capture todo (tabla
  // de intensidad, fields plotted, mini mapa) sin recortar nada. Devuelve
  // una función para revertir los estilos originales.
  function expandPanelFully(panelEl) {
    const prevOverflowY = panelEl.style.overflowY;
    const prevHeight = panelEl.style.height;
    const prevMaxHeight = panelEl.style.maxHeight;
    panelEl.style.overflowY = 'visible';
    panelEl.style.height = 'auto';
    panelEl.style.maxHeight = 'none';
    return function restore() {
      panelEl.style.overflowY = prevOverflowY;
      panelEl.style.height = prevHeight;
      panelEl.style.maxHeight = prevMaxHeight;
    };
  }

  // Recorre TODOS los elementos dentro del contenedor del mapa que tengan un
  // `transform: translate3d(x, y, 0)` inline (tiles individuales, el pane de
  // paneo, marcadores, decoradores de frentes, handles de vértices, etc.) y
  // los reemplaza por `left/top` equivalentes, dejando el transform en
  // "none". html2canvas no resuelve de forma fiable estos transforms
  // anidados de Leaflet, lo que provocaba que el área exportada quedara
  // desplazada respecto de lo que se ve en pantalla (ej. costa de Buenos
  // Aires en vez del área enfocada). Como cada conversión es local
  // (left/top relativos a su propio offsetParent), el orden de recorrido no
  // importa y el resultado visual final es idéntico al original.
  function freezeLeafletTransforms() {
    const restore = [];
    const mapEl = document.getElementById('map');
    if (!mapEl) return restore;
    // Sólo los contenedores de Leaflet (panes, capas, tiles, marcadores)
    // llevan `transform: translate3d(...)` inline; los miles de <path> de
    // una capa vectorial (ej. rutas nacionales) NO lo llevan individualmente,
    // así que basta con acotar la búsqueda a elementos con estilo inline que
    // contenga "translate3d" en el atributo style, evitando recorrer/leer
    // el estilo computado de cada path uno por uno.
    const all = mapEl.querySelectorAll('[style*="translate3d"]');
    all.forEach(function (el) {
      const transform = el.style && el.style.transform;
      if (!transform || transform === 'none') return;
      const m = /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(transform) ||
                /matrix\(1,\s*0,\s*0,\s*1,\s*(-?[\d.]+),\s*(-?[\d.]+)\)/.exec(transform);
      if (!m) return;
      const x = parseFloat(m[1]);
      const y = parseFloat(m[2]);
      const style = el.style;
      const prevLeft = style.left;
      const prevTop = style.top;
      const prevTransform = style.transform;
      const prevPosition = style.position;
      const currentLeft = parseFloat(style.left) || 0;
      const currentTop = parseFloat(style.top) || 0;
      if (!prevPosition || prevPosition === 'static') style.position = 'absolute';
      style.left = (currentLeft + x) + 'px';
      style.top = (currentTop + y) + 'px';
      style.transform = 'none';
      restore.push({ el, prevLeft, prevTop, prevTransform, prevPosition });
    });
    return restore;
  }

  function unfreezeLeafletTransforms(restore) {
    restore.forEach(function (r) {
      r.el.style.left = r.prevLeft;
      r.el.style.top = r.prevTop;
      r.el.style.transform = r.prevTransform;
      r.el.style.position = r.prevPosition;
    });
  }

  return { init };
})();
