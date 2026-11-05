# ADR 0107 — Producción igual a main y recursos pesados en Vercel Blob

- **Fecha:** 2026-11-05
- **Estado:** aceptada
- **Contexto:** pedido de René con captura del panel de Vercel del 2026-11-05.

## Contexto

René vio tres cosas en el panel:

1. **El proyecto decía «No Production Deployment»,** aunque croquis-sage.vercel.app sí cargaba.
2. **Vercel no construyó solo el merge del #163.**
3. **El almacenamiento de despliegues iba en 7.4 de 10 GB,** el límite del plan Hobby.

Lo que se encontró en el API de Vercel:

- **El merge del #163 no llegó a Vercel:**
  - Se fusionó a las 03:35:30 UTC (commit 59f6405).
  - El registro de actividad no tiene ningún despliegue de Git de ese commit.
  - El commit no tiene comentario del bot de Vercel ni estado de Vercel antes del despliegue hecho a mano.
  - El de antes, 2e8cdc8 (#162), se desplegó 6 s después de fusionarse.
- **Ninguna causa conocida aplica:**
  - El autor del commit es el dueño de la cuenta, `renecano`, con commit verificado; además, el repositorio es público.
  - No hay paso de build ignorado (`commandForIgnoringBuildStep` vacío).
  - `vercel.json` publica `main`.
  - El proyecto está ligado al repositorio con `createDeployments: enabled`.
  - No se llegó al límite diario.
  - La página de estado de Vercel no registra incidentes ese día.
  - Lo más probable es un aviso de GitHub que se perdió.
- **El panel decía «No Production Deployment», pero el API no:**
  - El despliegue de 59f6405 hecho con el API (`gitSource`, `target: production`) es el de producción del proyecto (`targets.production`).
  - Tiene los tres alias: croquis-sage, el del proyecto y el de la rama main.
  - Su origen no es `git`, y el panel puede no contarlo como el de producción de la rama.
- **Peso de cada despliegue:** `eval/despliegue_peso.mjs` lo midió sobre el build local (resultado en `eval/results/despliegue_peso.json`).
  - Pesa unos 94 MB.
  - De eso, `public/` aporta 47 MB: 27.7 MB de modelos de vehículos y 5.5 MB de HDRI.
  - Los estáticos de Next pesan 22.5 MB y las funciones 24.3 MB.
  - Había 32 despliegues guardados, unos 3 GB estimados, del 15 de octubre al 5 de noviembre.

## Decisión

1. **`/api/version` y el flujo «Producción = main»** (`.github/workflows/produccion.yml`).
   - `/api/version` dice el commit que sirve cada despliegue.
   - Después de cada push a main, el flujo espera hasta 25 min a que croquis-sage.vercel.app sirva ese commit o uno posterior.
   - Si a los 6 min no lo sirve y existe el secreto `VERCEL_DEPLOY_HOOK_MAIN`, dispara una vez el Deploy Hook de main.
   - Si al final no coincide, el flujo falla en el commit de main.
2. **Modelos de vehículos y HDRI en Vercel Blob,** fuera de cada despliegue.
   - El almacén público es `croquis-recursos`.
   - Cada carpeta va en `recursos/<carpeta>/<huella>/`, donde la huella es el sha256 de la lista de archivos y sus sha256.
   - Se sirven con `Cache-Control: public, max-age=31536000` y CORS abierto.
   - `apps/web/recursos.json` guarda la huella de cada carpeta.
   - `node apps/web/scripts/recursos.mjs subir` sube lo que falte.
   - En Vercel, el paso `preparar` del build hace esto:
     - comprueba que la huella local sea la de `recursos.json`;
     - comprueba que el almacén responda con CORS;
     - quita la carpeta de `public/`;
     - le pasa la URL al visor por `CROQUIS_RECURSOS_VEHICULOS` y `CROQUIS_RECURSOS_HDRI`, que `next.config.ts` fija al compilar.
   - Si algo no cuadra, la carpeta se queda en el despliegue: el sitio no se queda sin modelos, solo pesa más.
   - En local y en CI todo sale de `public/` como antes.
   - Una prueba unitaria falla si alguien cambia un modelo sin subirlo.
3. **Por qué esas dos carpetas:**
   - Son las únicas pesadas que ya se pedían solo cuando hacían falta.
   - Ya estaban fuera de la precarga del service worker.
   - Ya tenían respaldo sin red: los vehículos paramétricos y la luz de hemisferio.
   - Por eso el modo sin red no cambia.
   - Los cuerpos, los árboles, las texturas y la portada siguen en el despliegue porque sí se precargan.
4. **Limpieza:**
   - Se conservan el despliegue de producción y los dos anteriores; se borraron los otros 29, incluidas las dos previews de ramas viejas.
   - `vercel.json` ya solo publica `main` y `preview`.

## Alternativas descartadas

- **jsDelivr desde GitHub:** su límite es de 50 MB por repositorio y el de Croquis pesa unos 200 MB.
- **Un segundo proyecto de Vercel solo con los recursos:** cada versión sería otro despliegue que guardar, y crearlo cambia la cuenta más que un almacén.
- **`.vercelignore`:** su documentación solo habla de lo que se sube con la CLI; no garantiza nada en los despliegues de Git.

## Consecuencias

- **Peso por despliegue:** baja de unos 94 a unos 61 MB, un 35 % menos (medido en `eval/results/despliegue_peso.json`).
- **Cambios en un modelo o un HDRI:** cada cambio sube la carpeta completa a una ruta nueva.
  - Las versiones anteriores se quedan para los despliegues viejos.
  - Cada versión pesa unos 33 MB y el plan Hobby incluye 1 GB.
  - `recursos.mjs estado` lista las versiones guardadas.
- **Límite de transferencia de Blob:**
  - Hobby incluye 10 GB al mes de transferencia de Blob, menos que los 100 GB de la CDN.
  - Una sesión del 3D baja dos o tres modelos y un HDRI, y el navegador los guarda un año.
  - Si se llegara al límite, el visor caería a los vehículos paramétricos y a la luz de hemisferio, como sin red.
  - Queda en «Endurecimiento pendiente» vigilar ese uso antes de una demo grande.
- **Lo que se queda en el despliegue:**
  - Las funciones, con 18 MB de trozos del servidor, siguen siendo lo más pesado.
  - Revisarlas queda pendiente.
