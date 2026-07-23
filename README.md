# MCD Discussions Pro — Editor de Mesoscale Discussions para Argentina

Editor web estático (HTML/CSS/JS, sin build step) para crear **Mesoscale
Discussions (MCD)** con el estilo clásico del **SPC / NWS** (Storm Prediction
Center), adaptado a la cobertura territorial de **Argentina**.

## Cómo usarlo

No requiere instalación ni servidor backend. Basta con servir el directorio
como archivos estáticos, por ejemplo:

```bash
python3 -m http.server 8000
```

y abrir `http://localhost:8000/index.html` en el navegador.

## Estructura

```
index.html              Layout principal (panel SPC + mapa + toolbar)
css/style.css            Estilos clásicos SPC (blanco/negro, tipografía Arial bold)
js/basemaps.js           Definición de mapas base (OSM, CARTO, Cartopy oscuro, etc.)
js/boundaries.js         Carga de límites provinciales/departamentales (GeoJSON)
js/symbols.js            Simbología de frentes, isobaras, centros L/H
js/drawtools.js          Motor de dibujo: polígonos MCD, contornos, hatch, etc.
js/floatingbox.js        Cajas de texto flotantes arrastrables (estilo "WATCH LIKELY")
js/styleeditor.js        Panel contextual de edición (rueda de color RGB, etc.)
js/panel.js              Lógica del panel lateral SPC (swatches, campos)
js/minimap.js             Mini mapa regional (inset) del panel lateral
js/export.js             Exportación a PNG (html2canvas)
js/main.js               Inicialización general
data/provincias.json     Límites provinciales de Argentina (GeoJSON, sin simplificar)
data/departamentos.geojson  Límites departamentales de Argentina (GeoJSON, sin simplificar)
```

## Funcionalidades

- **Mapas base intercambiables**: OpenStreetMap, CARTO (Light / Dark Matter /
  Voyager), un estilo "Cartopy" gris oscuro personalizado con límites blancos
  (provinciales gruesos, departamentales finos, sin simplificar geometría), y
  una aproximación de satélite en blanco y negro.
- **Panel lateral estilo SPC**: número de MCD, validez, "Concerning", tipo y
  probabilidad de watch, tabla "Most Probable Peak Intensity" con swatches de
  color editables (rueda RGB), lista de "Fields Plotted" editable, y una
  mini-vista regional (inset) con las provincias de Argentina.
- **Herramientas de dibujo**:
  - Área MCD (polígono de contorno negro grueso, editable en grosor y vértices)
  - Área de contorno de color personalizable (rueda RGB) con borde negro fino
    exterior automático
  - Área con trama/hatch de color y ángulo personalizables
  - Frentes cálido, frío, estacionario, ocluido, dryline y vaguada (trough),
    con simbología clásica y color editable
  - Isobaras
  - Centros de presión L (baja) / H (alta), color y letra editables
  - Cajas de texto flotantes libres, con color de relleno, borde y texto
    personalizables
- **Exportación** a imagen PNG de la discusión completa.

## Fuente de los límites geográficos

- `data/provincias.json`: límites provinciales de Argentina.
- `data/departamentos.geojson`: límites departamentales (fuente IGN).
