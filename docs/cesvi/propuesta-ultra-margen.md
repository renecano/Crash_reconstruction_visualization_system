# Propuesta: «ultra con el margen» (para que René decida; no empezada)

**Fecha:** 2026-11-12. **Pedido de René:** alta y ultra dan casi los mismos fps y hay de 5 a 7 veces de margen sobre 60 en la computadora de demo; proponer una ronda de mejoras de ultra (texturas, sombras, reflejos, vegetación, detalle de edificios) con lo que costaría cada una, antes de hacerla.

## De dónde sale el margen

- **Ultra en la RTX 4070 Laptop** (programa de escritorio, `eval/results/e6_unity_escritorio.json`): de 289.4 a 410.2 fps, es decir, de 2.4 a 3.5 ms por cuadro. Para 60 fps hay 16.7 ms.
- **Por qué alta y ultra dan lo mismo:** con una pantalla de dpr 1, ultra dibuja a escala 1, igual que alta; lo demás que agrega ultra (sombras a 150 m, suavizado alto, sonda de 512, más matas y luminarias) le cuesta poco a esa tarjeta.
- **Falta un dato:** el build web en esa computadora (el paquete `visor-web-medicion` ya está publicado). El navegador agrega costo; con esa cifra se ajusta el presupuesto de abajo.

## Lo medido: mejoras que no piden código nuevo

`eval/ultra_margen.mjs` → `eval/results/ultra_margen.json`: ultra tal como está contra cada variante, en el build web, en dos escenas (AXA de día y la de referencia de noche), un navegador nuevo por medición. Se midió en la laptop de desarrollo (Intel UHD), así que vale **la razón** de tiempos de cuadro, no la cifra; la columna de la RTX es esa razón por los 3.5 ms de la escena más pesada en el escritorio: **una estimación hasta medirla allá**. Ojo: la laptop estaba en batería (queda registrado en el resultado); las razones salen de la misma corrida, pero el protocolo de E6 pide corriente, así que hay que repetirla conectada o, mejor, en la RTX.

| Mejora                                                  | Tiempo de cuadro contra ultra | En la RTX (estimado, peor escena) | Qué se ve                                                          |
| ------------------------------------------------------- | ----------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| Dibujar a 1.5× y reducir (sobremuestreo, 2.25× pixeles) | 1.68 a 1.89×                  | 5.8–6.5 ms (unos 150 fps)         | Bordes y texturas lejanas más finos; rejas, cables y rayas limpios |
| Dibujar a 2× y reducir (4× pixeles)                     | 2.76 a 2.79×                  | 9.7 ms (unos 100 fps)             | Lo mismo, más; casi sin escalones                                  |
| Mapa de sombras del sol de 8192 (hoy 4096)              | 1.08 a 1.23×                  | 3.7–4.3 ms                        | Sombras más nítidas (bordes de postes, árboles, vehículos)         |
| Sombras hasta 250 m (hoy 150 m)                         | 1.03 a 1.06×                  | 3.6–3.7 ms                        | Las cuadras lejanas también con sombra                             |
| MSAA 8× (hoy 4×)                                        | 1.13 a 1.15×                  | 4.0 ms                            | Poco, si ya hay sobremuestreo                                      |
| Hasta 16 luces por objeto (hoy 8)                       | 1.00 a 1.07×                  | 3.5–3.7 ms                        | De noche, más luminarias y faros iluminando a la vez               |

Costo de trabajo: cada una es un número del perfil de ultra (`Croquis.Core.Calidades`) más la medición en la RTX: unas 2 horas para todas juntas. Cero megabytes de descarga.

## Lo que pide código o recursos (trabajo y descarga estimados; la GPU se mide al hacerlo)

| Mejora                                                                                                             | Trabajo estimado | Descarga extra      | GPU (sin medir)                                  | Riesgo o nota                                                        |
| ------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| **Texturas al doble** (fachadas, asfalto, banqueta de 2K a 4K) y filtro anisotrópico 16×                           | 1 día            | +40 a 80 MB en Blob | Poca: memoria de la tarjeta                      | Más tiempo de carga la primera vez; solo en ultra                    |
| **Reflejos:** la sonda del escenario de 512 a 1024 y actualizada cada pocos cuadros; reflejo plano del piso mojado | 2 a 3 días       | 0                   | Media: dibuja la escena otra vez para el reflejo | En WebGL la sonda HDR falla (ADR 0113): sin HDR o solo en escritorio |
| **Vegetación:** árboles 3D completos cerca (hoy impostores lejos y cerca), el doble de matas                       | 2 días           | +10 a 20 MB         | Media: más llamadas de dibujo                    | Más llamadas de dibujo; los impostores se quedan para lo lejano      |
| **Detalle de edificios:** marcos y herrería en 3D, balcones, cables y letreros con relieve en la primera fila      | 3 a 4 días       | 0 (procedural)      | Baja a media: más triángulos                     | Más triángulos y más tiempo para armar la escena (carga)             |
| **Oclusión ambiental completa** a resolución completa y sombras de contacto de los vehículos más finas             | 1 día            | 0                   | Baja                                             | —                                                                    |

## Lo que no propongo

- **Profundidad de campo, desenfoque de movimiento y granulado:** se ven «de cine», pero esconden detalle. En un visor forense el perito tiene que distinguir siempre los vehículos, la vía y las evidencias (René, 2026-11-09).
- **Iluminación global en tiempo real o trazado de rayos:** URP en WebGL no lo tiene; en escritorio pediría HDRP, que es otro visor.

## Mi recomendación

1. **Primero lo medido y barato** (sobremuestreo a 1.5×, sombras de 8192 a 250 m, 16 luces): unas 2 horas, sin descarga. Multiplicando las razones medidas, la peor escena de la RTX quedaría entre 6.5 y 9.1 ms (de 110 a 150 fps); es una estimación que se confirma midiendo la combinación allá. Es lo que más se nota en una pantalla grande: bordes y sombras limpias.
2. **Después, texturas al doble y detalle de edificios** en la primera fila, que es lo que llena la cámara cinematográfica: unos 4 a 5 días.
3. **Reflejos y vegetación 3D** al final, si sobra tiempo antes de la demo.

Antes de fijar números: correr el paquete `visor-web-medicion` en la RTX (para saber el costo del navegador) y repetir `ultra_margen.mjs` allá con las variantes elegidas. Alta, media y baja no cambian.
