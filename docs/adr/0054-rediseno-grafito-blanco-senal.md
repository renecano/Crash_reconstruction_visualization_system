# ADR 0054 — Rediseño de /cesvi: grafito, blanco y una sola señal

- **Estado:** aceptado (2026-10-21).
- **Contexto:** René no aprobó el diseño de F11a en `/cesvi`. Lo sintió genérico, no le gustaron los colores, y los controles no mostraban la mano. Entregó maquetas en `docs/cesvi/rediseno/` (Paso2, Paso4, Paso6, Paso7 y Sistema) como fuente de verdad visual, no como código a copiar.

## Decisión

### Tokens (`assets/brand/tokens.json` → `tokens.css`)

- **Paleta nueva:** reemplaza la de F11a (asfalto, amarillo vial, naranja marcaje).

  | Rol             | Valor     |
  | --------------- | --------- |
  | Fondo           | `#0B0C0F` |
  | Superficie      | `#121418` |
  | Elevado         | `#1C1F25` |
  | Línea           | `#2A2E35` |
  | Línea suave     | `#1E2127` |
  | Texto           | `#F2F3F5` |
  | Texto 2         | `#A4A9B3` |
  | Texto 3         | `#7B818C` |
  | Señal (impacto) | `#FF5B2E` |
  | Vehículo A      | `#5AA9FF` |
  | Vehículo B      | `#FFC24B` |

  Papel y tinta se quedan para el tema claro.

- **Roles en `styles/sistema.css`:** `--accion` es el blanco y `--accion-texto` el grafito, porque la acción principal es un botón blanco con texto oscuro. `--senal` es la única señal, con `--evidencia` como alias. El foco es un anillo azul separado del control, como en la maqueta «Con foco».
- **Contraste:** `lib/vehiculos-cesvi.test.ts` revisa con la fórmula de WCAG 2, directo desde `tokens.json`, que todo texto (blanco, grises, señal, A y B) dé 4.5:1 o más sobre el fondo y la superficie, y que el texto grafito dé lo mismo sobre el blanco, A y B. Todos pasan.

### Tipografía

- **Fuentes:** Geist para la interfaz y Geist Mono para cifras y rótulos, con el paquete `geist` 1.8.1 de Vercel (SIL OFL 1.1) cargado con `next/font`. `next/font` genera el respaldo con métricas ajustadas, así que el texto no salta al llegar la fuente.
- **Estilos:** títulos en 600 con tracking negativo (de −0.02 a −0.035 em). Rótulos («PASO 4 DE 8», «LEYENDA») en Geist Mono, en mayúsculas con 0.08 em. Números grandes en Geist Mono 600.
- **Anybody:** ya no se carga. Queda solo en el logotipo, convertida a contornos dentro de los SVG. Las caras de respaldo ajustadas a Anybody y el subconjunto `anybody-latin-croquis.woff2` siguen en el repositorio para la portada en pausa, pero ninguna página los usa.

### Puntero

- **Regla global en la capa base:** muestran la mano `button`, `a[href]` y los roles button, tab, checkbox, switch y option, además de `summary`, `select`, una `label` que contiene un control, los checkbox, radio, range y file, y todo lo arrastrable (`[draggable]`, los marcadores de MapLibre y los puntos del mapa).
- **Lo desactivado:** usa `not-allowed`.

### Composición del recorrido

- **Encabezado:**
  - el logotipo;
  - la barra de pasos en una fila, con nombres cortos, una palomita en los pasos vistos y una píldora blanca en el actual;
  - a la derecha, el resumen del caso y «Exportar», que lleva al dictamen.
  - **Sin pie:** cada pantalla trae su frase, su «Ver detalle» y Anterior · Siguiente.
- **Pasos 3 y 4, sobre el mapa:** el mapa ocupa la pantalla y encima van paneles de vidrio. El paso 4 sigue su maqueta:
  - **a la izquierda:** el rótulo, el título, la frase, el control segmentado de las versiones, las dos medidas de restos, lo elegido y «Superponer la otra versión»;
  - **a la derecha:** la leyenda;
  - **abajo:** el reproductor, con reproducir o pausar y una línea de tiempo que marca el impacto a la mitad y se puede arrastrar.
- **Pasos 1, 2, 5, 6, 7 y 8, en página sobre grafito:** el mapa sigue montado detrás para que la cámara vuele entre pasos y para la imagen del PDF.
  - **Con maqueta:** el 2, el 6 y el 7.
  - **Sin maqueta:** el 1, el 5 y el 8 usan las mismas piezas (`recorrido/marco.tsx`: rótulo, frase, navegación, página y panel; tarjetas, insignias y etiquetas de vehículo).
- **El mapa** (como la maqueta del paso 4):
  - la posición final de cada vehículo en su color sólido y la inicial con contorno punteado;
  - la trayectoria de cada vehículo;
  - la zona de restos como banda rayada, con su medida en una píldora blanca;
  - la X de señal con su resplandor;
  - la otra versión, superpuesta y punteada.
  - **Atribución:** la de MapLibre se reemplaza por un pie propio con OpenStreetMap, OpenFreeMap y OpenMapTiles, junto a «Reconstrucción de apoyo · el dictamen es del perito».
- **«Aceptar y seguir» (paso 7):** registra la validación y lleva al dictamen.

### A y B con su color y su etiqueta en todo el recorrido

- **Dónde:**
  - **mapa:** formas, trayectorias, etiquetas y puntos;
  - **narración:** frases resaltadas y la barra de cada dato;
  - **daños:** contornos y zonas dañadas en el color del vehículo;
  - **números:** la etiqueta de cada cálculo;
  - **sugerencia:** las siluetas en miniatura;
  - **PDF:** un cuadro de color junto a cada nombre.
- **De dónde salen los colores:** del PDF, en `lib/vehiculos-cesvi.ts`. Una prueba revisa que coincidan con `tokens.json`.

### Marca

- **La X del símbolo pasa a `#FF5B2E`.** El símbolo y el logotipo no cambian.
- **Cómo se hizo:** se cambió la constante en `assets/brand/tools/make_brand.py` y se regeneraron los 14 SVG. Una comparación muestra que, salvo la X, son idénticos a los anteriores.
- **El sello de procedencia (C2PA):** los SVG anteriores traían uno que la herramienta no genera, con un hash del contenido. Cambiar el color a mano lo habría dejado inválido, así que los SVG regenerados salen sin él.
- **Íconos, favicon y manifiesto:** se regeneraron con `pnpm marca`.

## Consecuencias

- **Todo el sitio cambia de paleta y de tipografía:** los tokens son globales. Las páginas en pausa (portada, historia, visor 3D) heredan el sistema nuevo sin rediseñarse. Queda anotado en «Endurecimiento pendiente».
- **Pruebas:** la e2e del recorrido sigue siendo la única. Se adaptó a la composición nueva: pestañas de versión con `aria-selected`, lo elegido en dos líneas, y «Aceptar y seguir» que lleva al paso 8. No hay capturas de referencia.
- **Las maquetas:** se versionan en `docs/cesvi/rediseno/` tal como las entregó René, fuera de Prettier.
