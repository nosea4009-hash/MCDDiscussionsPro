/* ==========================================================================
   floatingbox.js
   Cajas de texto flotantes tipo "-- WATCH LIKELY --" (arrastrables sobre el
   mapa, con texto editable, color de relleno, color de borde y color de
   texto totalmente customizables).
   ========================================================================== */

const FloatingBoxes = (function () {

  let container = null; // #map-wrapper
  let boxes = [];        // { el, header, body, id }
  let selected = null;
  let seq = 1;

  function init(mapWrapperEl) {
    container = mapWrapperEl;
    // wire up the pre-existing box in the HTML
    const existing = document.getElementById('watchStatementBox');
    if (existing) wireBox(existing);
  }

  function createAt(top, left) {
    const tpl = document.getElementById('tpl-floating-textbox');
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.style.top = top + 'px';
    node.style.left = left + 'px';
    container.appendChild(node);
    wireBox(node);
    selectBox(node);
    return node;
  }

  function wireBox(el) {
    el._boxId = 'box_' + (seq++);
    boxes.push(el);

    // dragging via handle
    const handle = el.querySelector('.ftb-handle');
    let dragOffset = null;

    function onPointerDown(e) {
      const evt = e.touches ? e.touches[0] : e;
      const rect = el.getBoundingClientRect();
      const wrapRect = container.getBoundingClientRect();
      dragOffset = {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
      };
      document.addEventListener('mousemove', onPointerMove);
      document.addEventListener('mouseup', onPointerUp);
      document.addEventListener('touchmove', onPointerMove, { passive: false });
      document.addEventListener('touchend', onPointerUp);
      e.preventDefault();
      selectBox(el);
    }
    function onPointerMove(e) {
      if (!dragOffset) return;
      const evt = e.touches ? e.touches[0] : e;
      const wrapRect = container.getBoundingClientRect();
      let left = evt.clientX - wrapRect.left - dragOffset.x;
      let top = evt.clientY - wrapRect.top - dragOffset.y;
      left = Math.max(0, Math.min(left, wrapRect.width - el.offsetWidth));
      top = Math.max(0, Math.min(top, wrapRect.height - el.offsetHeight));
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      if (e.cancelable) e.preventDefault();
    }
    function onPointerUp() {
      dragOffset = null;
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseup', onPointerUp);
      document.removeEventListener('touchmove', onPointerMove);
      document.removeEventListener('touchend', onPointerUp);
    }

    handle.addEventListener('mousedown', onPointerDown);
    handle.addEventListener('touchstart', onPointerDown, { passive: false });

    el.addEventListener('click', function (e) {
      selectBox(el);
      e.stopPropagation();
    });
  }

  function selectBox(el) {
    boxes.forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    selected = el;
    StyleEditor.showForFloatingBox(el);
  }

  function getSelected() { return selected; }

  function deselectAll() {
    boxes.forEach(b => b.classList.remove('selected'));
    selected = null;
  }

  function remove(el) {
    if (!el) return;
    el.remove();
    boxes = boxes.filter(b => b !== el);
    if (selected === el) selected = null;
  }

  function setFillColor(el, color) { el.style.background = color; }
  function setBorderColor(el, color) { el.style.borderColor = color; }
  function setTextColor(el, color) {
    el.style.color = color;
    el.querySelectorAll('.ftb-header, .ftb-body').forEach(n => n.style.color = color);
  }

  return { init, createAt, getSelected, deselectAll, remove, setFillColor, setBorderColor, setTextColor, selectBox };
})();
