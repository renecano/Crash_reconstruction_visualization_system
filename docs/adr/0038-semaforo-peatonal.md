# ADR 0038 — Semáforo peatonal: contrato 1.3.0, fuera del prompt vigente (F8, pendiente cerrado en F11)

- **Estado:** aceptado (2026-10-19).
- **Contexto:** el semáforo peatonal era un pendiente de F8 (ADR 0022). El contrato no lo tenía: `Dispositivo.tipo` no lo incluía y `aplica_a` solo acepta vehículos.

## Decisión

1. **Contrato 1.3.0:** `semaforo_peatonal` en `Dispositivo.tipo`. Sus `fases` son para los peatones:
   - verde, la figura que camina;
   - rojo, la figura detenida;
   - intermitente, la figura que camina destellando (despeje).

   Amarillo no existe en un semáforo peatonal; si llega, se toma como despeje.

2. **Migración y regenerados:**
   - migración identidad 1.2.0 → 1.3.0 en TS y Python;
   - regenerados: Zod y Pydantic, escenas canónicas, constructores de spec, Relatos-MX (con los dos candados de test intactos), salidas doradas y casos de la demo;
   - los resultados del solver no cambian, así que E7 y E8 tampoco.
3. **Fuera del esquema de salida del LLM:** el tipo nuevo no entra a los enums que se piden a Claude en ningún prompt vigente (`NOT_ASKED_DEVICES`, en TS y Python).
   - **Por qué:** si entrara, cambiaría la huella de los prompts v1–v3 y todas sus respuestas grabadas dejarían de valer. E1, CI y la demo dependen de ellas.
   - **De dónde llega el semáforo peatonal:** del croquis (el editor de JSON) o de una escena escrita a mano.
   - **Para que lo lea el LLM** haría falta un prompt v4, con su E1 y su gasto de API (pendiente).
4. **Visor:**
   - **Forma:** poste de 2.5 m y cabeza con dos lentes cuadradas de 20 cm, con la figura detenida arriba (roja) y la que camina abajo (verde). Las figuras son un mapa emisivo dibujado en un lienzo en el navegador.
   - **Orientación:** cada cabeza mira a la persona de su fase (su id en `movimiento`). Si no hay persona, las cabezas quedan espalda con espalda.
   - **Tiempo:** no se infieren cambios, igual que en el vehicular sin `tiempo_en_fase`.
5. **Croquis 2D:** icono con dos lentes, roja arriba y verde abajo.

## Consecuencias

- **Escenas canónicas:** ninguna lo usa, porque ningún relato menciona un semáforo peatonal y no se agrega lo que el relato no dice. Por eso no cambia ninguna referencia visual.
- **Verificación:** con pruebas y con una escena de prueba en el visor.
