# ADR 0146 · Lo narrado llega a la escena: clase, lugar y sentido, objeto, encimados y calles

- **Fecha:** 2026-11-18
- **Estado:** aceptada.
- **Pedido:** René, ronda 4: «lo que dice la narración no llega a la física ni al 3D… no es solo ese caso, todos los casos no funcionan como deben». La velocidad va aparte, en el ADR 0145.

## Decisión

1. **La clase del vehículo** sale de cómo lo dice el perito o de su modelo (`relato.ts`).
   - Palabras genéricas, con la clase más cercana como supuesto declarado, con su cita y su porqué:

     | Dice            | Clase supuesta  |
     | --------------- | --------------- |
     | «un sedán»      | sedán mediano   |
     | «una camioneta» | pick-up         |
     | «un camión»     | camión unitario |
     | «una SUV»       | SUV compacta    |
     | «un tracto»     | tractocamión    |

   - Los modelos más comunes en México («Tsuru», «Versa», «March», «CR-V», «Hilux», «Lobo»…) toman la carrocería con que se venden.
   - Solo se pregunta si la narración de verdad no lo dice («un auto» a secas).
   - Esto cambia la regla anterior de que «los nombres comerciales no son clases»: René pidió «de marca y modelo».
2. **El lugar y el sentido, separados** (`lugar-narrado.ts`).
   - Al buscador solo va el lugar, con el municipio y el estado del caso; nunca la frase completa.
   - El sentido es la dirección de llegada:
     - cardinal («de oriente a poniente», «sentido sur-norte», «con dirección al norte»);
     - o un destino («rumbo a Ciudad de México»). El destino se busca aparte, y el rumbo del lugar hacia él dice en qué sentido de la vía venía.
   - Medido con 20 frases al estilo de CESVI (`eval/results/ronda4_lugar_sentido.json`):

     |                  | Antes | Después |
     | ---------------- | ----- | ------- |
     | Vía correcta     | 2/20  | 17/20   |
     | Sentido correcto | 10/20 | 19/20   |

3. **El objeto del primer impacto** (árbol, poste, muro) va frente a la cara de contacto del vehículo, donde el perito marcó el choque. Antes iba en la posición de la plantilla (6, −6). El solver toma el objeto como punto de contacto, así que desviaba al vehículo hacia él, fuera de la vía.
4. **Las calles del lugar se guardan con el caso** (`caso.lugar.calles_del_mapa`): La escena, la reconstrucción y el 3D las tienen sin red. Sin calles de ninguna fuente:
   - la dirección de llegada queda como «falta», sin flechas cardinales inventadas;
   - el aviso lo dice una vez, en tono informativo.
5. **Encimados en el choque.**
   - Más de 0.3 m de traslape entre vehículos, o entre un vehículo y su objeto, ya no es un contacto. La escena lo dice en el momento, con dos salidas:
     - «Separarlos»: los deja tocándose por la cara de contacto;
     - «Así fue el contacto».
   - El solver resuelve el contacto de las trayectorias, así que encimados en ángulo o de frente el impacto sale completo (medido).
   - El choque fantasma venía de otro lado: uno detrás de otro con la misma velocidad supuesta, ΔV 0. Ahora, si en el primer choque ningún vehículo cambia su velocidad más de 2 km/h, la reconstrucción lo dice en sus límites y en pantalla. Ya no se ve como un empujón mudo.
6. **Pendiente, puente y curva narrados** van como condiciones con su cita.
   - Una subida o una bajada (no sobre un puente) enciende el relieve real del lugar, así que la física usa la pendiente medida, no una supuesta.
   - Un puente se dibuja en el 3D. La física va sobre la losa, a nivel.

## Consecuencias

- **Ninguna cifra de AXA ni de los cinco ejemplos cambia:** no narran velocidad, sus objetos no son del primer impacto y no quedan encimados. AXA queda en 57 (55–78), medido.
- **Las seis narraciones nuevas** (`docs/cesvi/ronda-4/narraciones-fisica.md`) y el caso encimado se corren de punta a punta en la demo local (`e2e/narraciones-fisica.spec.ts`), con capturas del 3D.
