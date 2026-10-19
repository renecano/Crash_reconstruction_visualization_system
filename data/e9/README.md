# Sesiones de E9

**Qué va aquí:** una sesión por persona (`sesiones/e9-P01.json`, …), tal como la descarga la página `/e9` al terminar.

**Qué contienen:** solo métricas.

- el código de participante;
- el momento de algunos eventos (enviar el relato, contestar preguntas, corregir el croquis, ver la reconstrucción);
- las respuestas del SUS.

Nunca el texto del relato ni datos personales: `uv run croquis-eval e9` rechaza cualquier otro campo.

**Procedimiento y consentimiento:** `docs/e9/protocolo.md`.

**Cómo se agregan:** `uv run croquis-eval e9` → `eval/results/e9.json`. Sin sesiones no escribe nada: E9 sigue pendiente.
