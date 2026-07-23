/* ==========================================================================
   paneltheme.js
   Selector de "tema de color" para la plantilla del panel lateral SPC.
   Por defecto se mantiene el clásico blanco/negro/gris, pero se puede
   cambiar a otras paletas predefinidas o a colores 100% personalizados
   (fondo, texto y bordes) usando <input type="color">.
   ========================================================================== */

const PanelTheme = (function () {

  const THEMES = {
    classic: { bg: '#ffffff', text: '#000000', border: '#000000', borderSoft: '#999999', accentBg: '#f6f6f6' },
    dark:    { bg: '#2b2b2b', text: '#f0f0f0', border: '#ffffff', borderSoft: '#777777', accentBg: '#3a3a3a' },
    navy:    { bg: '#0a1a33', text: '#ffffff', border: '#ffffff', borderSoft: '#5577aa', accentBg: '#132a4d' }
  };

  function applyTheme(theme) {
    const root = document.documentElement.style;
    root.setProperty('--panel-bg', theme.bg);
    root.setProperty('--panel-text', theme.text);
    root.setProperty('--panel-border', theme.border);
    root.setProperty('--panel-border-soft', theme.borderSoft);
    root.setProperty('--panel-accent-bg', theme.accentBg);
  }

  function init() {
    const select = document.getElementById('panelThemeSelect');
    const customBox = document.getElementById('panelCustomColors');
    const bgInput = document.getElementById('panelBgColor');
    const textInput = document.getElementById('panelTextColor');
    const borderInput = document.getElementById('panelBorderColor');

    function applyCustom() {
      applyTheme({
        bg: bgInput.value,
        text: textInput.value,
        border: borderInput.value,
        borderSoft: borderInput.value,
        accentBg: bgInput.value
      });
    }

    select.addEventListener('change', function () {
      const key = select.value;
      if (key === 'custom') {
        customBox.classList.remove('hidden');
        applyCustom();
      } else {
        customBox.classList.add('hidden');
        applyTheme(THEMES[key] || THEMES.classic);
      }
    });

    [bgInput, textInput, borderInput].forEach(function (input) {
      input.addEventListener('input', applyCustom);
    });
  }

  return { init, applyTheme, THEMES };
})();
