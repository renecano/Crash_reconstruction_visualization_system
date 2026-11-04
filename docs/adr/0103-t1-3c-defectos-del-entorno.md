# ADR 0103 — T1.3c: defectos de la segunda pasada del entorno

- **Estado:** aceptado (2026-11-04). Tercer punto del pedido de René del 2026-11-04, después del 3D en blanco (ADR 0102) y la cámara del conductor.
- **Contexto:** René revisó las capturas de T1.3b (ADR 0099) y pidió corregir: la costura vertical en los árboles impostores, la palmera pixeleada, el cielo de día casi blanco (que se vean gradiente y nubes), el fondo de noche verde olivo (azul oscuro neutro a casi negro) y las fachadas oscuras y saturadas sin relieve (marcos, cornisas, zócalo, un saliente por edificio). Media debe seguir en ≥ 60 fps.

## Diagnóstico y decisiones

1. **Costura de los impostores** (`tree-impostors.ts`): las tres tarjetas cruzadas se ven de canto desde ciertas direcciones y el recorte alfa deja una línea vertical. El alfa de cada tarjeta se desvanece con el ángulo entre su normal y la vista (`smoothstep(0.08, 0.38, |n·v|)`): la tarjeta de canto desaparece y las otras dos la cubren.
2. **Palmera pixeleada**: los foliolos eran franjas calculadas por pixel con `step` y recortadas por alfa; de lejos, con los mipmaps promediando, salían escaleras y rayas. Ahora la fronda es una textura (`frondTexture`, 128×512, mipmaps) con la silueta en el alfa y los foliolos sugeridos por el tono (sin huecos: los huecos se veían como rayas desde la calle), 12 frondas de 6 segmentos y el alfa que sube de lejos como en los impostores.
3. **Cielo de día casi blanco**: lo que ve la cámara a nivel de calle (3–6 m, 35–50 mm) son los 9° más bajos del cielo, donde el modelo de Preetham da más de diez veces el blanco del mapeo tonal: todo se recortaba a blanco. Medido en la captura cinematográfica de `lateral_interseccion`: la franja de arriba era (227, 227, 227) constante. El cielo horneado ahora se atenúa hacia el horizonte (`SKY_HORIZON_DIM` 0.5 → `SKY_ZENITH_DIM` 0.85) y lleva un tope de luminancia que conserva el tono (0.4 en el horizonte → 0.8 a 24°): la franja queda azul claro con gradiente, (183, 206, 213) arriba y (164, 178, 179) junto a los cerros. Además, despejado con turbidez 1.6 (antes 2.5), más Rayleigh, menos Mie, nubes más bajas (`cloudElevation` 0.22) y la niebla de día azulada (`#9fb3c6`, antes `#cfdbe6`).
4. **Noche verde olivo**: el horizonte del domo (`#2a2823`) y la niebla (`#26251f`) con alumbrado eran pardos y, con el ambiente cálido, se leían oliva. Ahora azul oscuro neutro a casi negro: domo `#1b2030` → `#04060b` con alumbrado y `#10162a` → `#030509` sin él; niebla `#12161f` y `#0b0e18`.
5. **Fachadas**: paleta clara y poco saturada (claridad sRGB > 0.6, saturación HSV < 0.45; `FACADE_PALETTE_MX`), y relieve: pintado (marcos claros de 12 cm alrededor de las ventanas, cornisa clara en los últimos 25 cm con su sombra debajo, zócalo más oscuro) y real (una cornisa que sobresale 22 cm a lo largo del frente y, en el 70 % de los edificios de dos niveles o más, una losa de balcón en el primer nivel), instanciados con un material de concreto.

## Evidencia

- Capturas `docs/cesvi/t1/t1.3c/` (las cuatro escenas, cinematográfica y daño, media).
- fps en media (`eval/results/e6_t1_t1.3c_media.json`, protocolo E6 de T1: ver PROGRESS).
- Pruebas: `t13c.test.ts` (noche azul oscuro, niebla de día azulada, paleta clara y poco saturada, textura de la fronda con mipmaps y bordes suaves) y las de siempre del entorno.

## Límites

- El tope de luminancia del cielo es artístico: por encima de 24° el cielo es el físico atenuado; por debajo, se recorta para que no sature. La cámara cinematográfica sigue viendo poco cielo (≈ 9°): las nubes aparecen en las escenas con cámara más alta o en la cámara del conductor.
- Los salientes de las fachadas son losas rectas; no hay balcones con barandal ni molduras.
