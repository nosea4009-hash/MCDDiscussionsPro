/* ==========================================================================
   styleeditor.js
   Panel flotante contextual para editar el elemento seleccionado:
   - Contornos de color (rueda RGB vía iro.js) + opacidad de relleno
   - Áreas hatched (color + ángulo de trama)
   - Frentes (tipo + color)
   - Cajas de texto flotantes (color de relleno, borde, texto, contenido)
   - Centros L/H (color, letra)
   - Swatches de la tabla Peak Intensity
   ========================================================================== */

const StyleEditor = (function () {

  const panel = document.getElementById('styleEditor');
  const titleEl = document.getElementById('seTitle');
  const bodyEl = document.getElementById('seBody');
  let currentIro = null;

  document.getElementById('seClose').addEventListener('click', hide);

  function hide() {
    panel.classList.add('hidden');
    bodyEl.innerHTML = '';
    currentIro = null;
  }

  function show(title) {
    titleEl.textContent = title;
    panel.classList.remove('hidden');
  }

  function clearBody() { bodyEl.innerHTML = ''; currentIro = null; }

  function addRow(html) {
    const div = document.createElement('div');
    div.className = 'se-row';
    div.innerHTML = html;
    bodyEl.appendChild(div);
    return div;
  }

  function addColorWheel(initialColor, onChange) {
    const row = document.createElement('div');
    row.className = 'se-row';
    const label = document.createElement('label');
    label.textContent = 'Color (rueda RGB)';
    row.appendChild(label);
    const wheelDiv = document.createElement('div');
    wheelDiv.className = 'se-iro-wheel';
    const wheelId = 'iro-' + Math.random().toString(36).slice(2);
    wheelDiv.id = wheelId;
    row.appendChild(wheelDiv);
    bodyEl.appendChild(row);

    const colorPicker = new iro.ColorPicker('#' + wheelId, {
      width: 180,
      color: initialColor || '#ff0000',
      layout: [
        { component: iro.ui.Wheel },
        { component: iro.ui.Slider, options: { sliderType: 'value' } }
      ]
    });
    colorPicker.on('color:change', function (color) {
      onChange(color.hexString);
    });
    currentIro = colorPicker;
    return colorPicker;
  }

  function addTextInput(labelText, value, onInput) {
    const row = addRow(`<label>${labelText}</label><input type="text" value="${escapeAttr(value)}">`);
    const input = row.querySelector('input');
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  function addTextArea(labelText, value, onInput) {
    const row = addRow(`<label>${labelText}</label><textarea rows="3">${escapeHtml(value)}</textarea>`);
    const ta = row.querySelector('textarea');
    ta.addEventListener('input', () => onInput(ta.value));
    return ta;
  }

  function addColorInput(labelText, value, onInput) {
    const row = addRow(`<label>${labelText}</label><input type="color" value="${value}">`);
    const input = row.querySelector('input');
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  function addRange(labelText, min, max, step, value, onInput) {
    const row = addRow(`<label>${labelText}: <span class="rv">${value}</span></label><input type="range" min="${min}" max="${max}" step="${step}" value="${value}">`);
    const input = row.querySelector('input');
    const span = row.querySelector('.rv');
    input.addEventListener('input', () => { span.textContent = input.value; onInput(parseFloat(input.value)); });
    return input;
  }

  function addSelect(labelText, options, value, onChange) {
    const optHtml = options.map(o => `<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`).join('');
    const row = addRow(`<label>${labelText}</label><select>${optHtml}</select>`);
    const sel = row.querySelector('select');
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  function addCheckbox(labelText, checked, onChange) {
    const row = addRow(`<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" ${checked ? 'checked' : ''} style="width:auto;"> ${labelText}</label>`);
    const input = row.querySelector('input');
    input.addEventListener('change', () => onChange(input.checked));
    return input;
  }

  function addDeleteButton(onDelete) {
    const row = document.createElement('div');
    row.className = 'se-actions';
    row.innerHTML = `<button style="background:#7a1414;color:#fff;border:1px solid #a31d1d;">🗑 Eliminar elemento</button>`;
    row.querySelector('button').addEventListener('click', onDelete);
    bodyEl.appendChild(row);
  }

  function escapeHtml(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escapeAttr(s) { return (s || '').replace(/"/g,'&quot;'); }

  /* -------------------- Public: show for a DrawTools item -------------------- */

  function showFor(record) {
    if (!record) { hide(); return; }
    clearBody();
    const obj = record.obj;

    switch (record.kind) {
      case 'mcd-polygon':
        show('Área MCD (contorno negro)');
        addRange('Grosor del contorno', 2, 10, 0.5, obj.layer.options.weight || 4.5, v => obj.setWeight(v));
        addDeleteButton(() => { DrawTools.deleteSelected(); });
        break;

      case 'contour-polygon':
        show('Contorno de color (RGB)');
        addColorWheel(obj.color, c => obj.setColor(c));
        addCheckbox('Rellenar interior', obj.fillEnabled, checked => { obj.setFillEnabled(checked); showFor(record); });
        if (obj.fillEnabled) {
          addRange('Opacidad de relleno', 0, 1, 0.05, obj.fillOpacity, v => obj.setFillOpacity(v));
        }
        addRow('<em style="font-size:11px;color:#555;">Incluye contorno negro fino exterior automático.</em>');
        addDeleteButton(() => { DrawTools.deleteSelected(); });
        break;

      case 'hatch-polygon':
        show('Área con trama (Hatch)');
        addColorWheel(obj.color, c => obj.setColor(c));
        addRange('Ángulo de trama', 0, 180, 5, obj.angle, v => obj.setAngle(v));
        addDeleteButton(() => { DrawTools.deleteSelected(); });
        break;

      case 'front':
        show('Frente: ' + obj.label());
        addSelect('Tipo de frente', [
          { value: 'front-warm', label: 'Cálido' },
          { value: 'front-cold', label: 'Frío' },
          { value: 'front-stationary', label: 'Estacionario' },
          { value: 'front-occluded', label: 'Ocluido' },
          { value: 'dryline', label: 'Dryline' },
          { value: 'trough', label: 'Vaguada' },
          { value: 'isobar', label: 'Isobara' }
        ], obj.frontType, v => { obj.setFrontType(v); showFor(record); });
        addColorWheel(obj.color, c => obj.setColor(c));
        addDeleteButton(() => { DrawTools.deleteSelected(); });
        break;

      case 'pressure':
        show('Centro de presión');
        addSelect('Letra', [{ value: 'L', label: 'L (Baja)' }, { value: 'H', label: 'H (Alta)' }], obj.letter, v => { obj.setLetter(v); });
        addColorWheel(obj.color, c => obj.setColor(c));
        addDeleteButton(() => { DrawTools.deleteSelected(); });
        break;

      case 'free-label':
        show('Etiqueta de texto');
        addColorWheel('#000000', c => obj.setColor(c));
        addDeleteButton(() => { DrawTools.deleteSelected(); });
        break;

      default:
        hide();
    }
  }

  /* -------------------- Public: show for a floating text box -------------------- */

  function showForFloatingBox(el) {
    clearBody();
    show('Caja de texto');

    const header = el.querySelector('.ftb-header');
    const body = el.querySelector('.ftb-body');

    addRow('<label>Título</label>');
    // header text edited inline via contenteditable directly on canvas; provide quick sync field too
    addTextInput('Editar título (rápido)', header.textContent, v => header.textContent = v);
    addTextArea('Editar cuerpo (rápido)', body.textContent, v => body.textContent = v);

    addColorInput('Color de relleno de la caja', rgbToHex(getComputedStyle(el).backgroundColor) || '#ffffff', c => FloatingBoxes.setFillColor(el, c));
    addColorInput('Color del contorno de la caja', rgbToHex(getComputedStyle(el).borderColor) || '#000000', c => FloatingBoxes.setBorderColor(el, c));
    addColorInput('Color del texto', rgbToHex(getComputedStyle(header).color) || '#000000', c => FloatingBoxes.setTextColor(el, c));

    addDeleteButton(() => { FloatingBoxes.remove(el); hide(); });
  }

  /* -------------------- Public: show for peak intensity swatch -------------------- */

  function showForSwatch(swatchEl) {
    clearBody();
    show('Color de intensidad');
    const current = rgbToHex(getComputedStyle(swatchEl).backgroundColor) || '#ff0000';
    addColorWheel(current, c => { swatchEl.style.background = c; });
  }

  /* -------------------- Public: show for department labels (AR+PY+UY) -------------------- */

  function showForDeptLabels() {
    clearBody();
    show('Etiquetas de departamentos');
    addRow('<label>Color del texto</label>');
    addColorWheel(DeptLabels.getTextColor(), c => DeptLabels.setTextColor(c));
    addRow('<label>Color del contorno exterior del texto</label>');
    // Se agrega una segunda rueda de color independiente para el contorno;
    // como addColorWheel reemplaza currentIro, se crea manualmente el
    // segundo wheel para poder tener dos activos en simultáneo en este panel.
    const wheelDiv = document.createElement('div');
    wheelDiv.className = 'se-iro-wheel';
    const wheelId = 'iro-' + Math.random().toString(36).slice(2);
    wheelDiv.id = wheelId;
    const row = document.createElement('div');
    row.className = 'se-row';
    row.appendChild(wheelDiv);
    bodyEl.appendChild(row);
    const outlineWheel = new iro.ColorPicker('#' + wheelId, {
      width: 180,
      color: DeptLabels.getOutlineColor(),
      layout: [
        { component: iro.ui.Wheel },
        { component: iro.ui.Slider, options: { sliderType: 'value' } }
      ]
    });
    outlineWheel.on('color:change', function (color) { DeptLabels.setOutlineColor(color.hexString); });

    addRow('<em style="font-size:11px;color:#555;">Fuente: Open Sans Bold.</em>');
  }

  function rgbToHex(rgb) {
    if (!rgb) return null;
    const m = rgb.match(/\d+/g);
    if (!m) return null;
    return '#' + m.slice(0,3).map(x => parseInt(x).toString(16).padStart(2,'0')).join('');
  }

  return { showFor, showForFloatingBox, showForSwatch, showForDeptLabels, hide };
})();
