# Guion 2 — Demo de producto (≈ 4 min)

**Para quién:** quien quiere ver cómo se usa.

**Material:**

- la demo «Tú eres…» (`/demo`), que corre sin servidor;
- el relato propio (`/relato`), que necesita red y la llave de Claude en producción;
- el croquis (`/croquis`);
- el visor con su panel de hipótesis y las exportaciones.

**Antes de grabar:**

- probar el recorrido completo en producción;
- usar un perfil limpio del navegador, con zoom al 100 %.

| #   | Tiempo    | En pantalla                                                                                                                       | Voz                                                                                                                                               |
| --- | --------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 0:00–0:15 | Portada; clic en «Probar la demo: Tú eres…».                                                                                      | «Imagina que tú eres quien tiene que explicar qué pasó.»                                                                                          |
| 2   | 0:15–0:40 | `/demo`: se elige «Alcance en Paseo Tollocan, con el piso mojado». Se lee el relato en pantalla.                                  | «Este es un relato de ejemplo, escrito como lo diría cualquiera: “iba por Paseo Tollocan… la camioneta frenó de golpe… el piso mojado”.»          |
| 3   | 0:40–1:15 | La sección «Lo que entendió la IA»: se pasa el cursor por las etiquetas «del relato», «supuesto» y «por omisión» y por las citas. | «Cada dato dice de dónde salió: “mojado” viene de “el piso mojado”. Lo que no dijiste se marca como supuesto, como la velocidad de la camioneta.» |
| 4   | 1:15–1:45 | «Lo que falta»: se contesta la velocidad del otro vehículo (20) y se pulsa «Responder». Aparece «Rondas contestadas: 1».          | «Croquis pregunta solo lo que más cambia el resultado. Contestas lo que sepas; si no lo sabes, lo dejas en blanco.»                               |
| 5   | 1:45–2:20 | «Corregir en el croquis»: se arrastra un vehículo y se gira; se pulsa «Ver en 3D».                                                | «En el croquis acomodas lo que haga falta. Lo que tú mueves queda marcado como tuyo.»                                                             |
| 6   | 2:20–3:00 | El visor: reproducción, cámara lenta, cámara del conductor y cámara de daño.                                                      | «La física calcula el choque y el visor lo muestra desde cualquier ángulo. Todo esto corre en tu dispositivo.»                                    |
| 7   | 3:00–3:30 | Panel de hipótesis: «¿y si iba a 60?»; aparece el vehículo fantasma y la tabla de diferencias.                                    | «Puedes comparar hipótesis: ¿qué habría cambiado a otra velocidad?»                                                                               |
| 8   | 3:30–3:50 | Panel «Exportar»: informe PDF y video. Se abre el PDF y se muestra la marca.                                                      | «Y te llevas un informe y un video, siempre con la marca: es una reconstrucción ilustrativa, no un peritaje.»                                     |
| 9   | 3:50–4:00 | Corte a `/relato`, con el cursor en el cuadro de texto.                                                                           | «Ahora cuéntalo tú.»                                                                                                                              |

**Notas de producción:**

- **Sin red:** la demo también corre sin conexión. Se puede mostrar con el modo avión antes del paso 2, para enseñar que no hay servidor.
- **`/relato` en vivo:** gasta API. Se graba una sola toma, con el tope diario configurado en Vercel.
- **Datos personales:** nunca se usan datos reales; los relatos de la demo son sintéticos (Relatos-MX).
