# ADR 0049 — Protección de acceso del prototipo para CESVI

- **Estado:** aceptado (2026-10-20).
- **Contexto:** `docs/cesvi/PROTOTIPO.md` pide que la demo en Vercel vaya con protección de acceso, porque muestra un caso real. La contraseña de Vercel para despliegues es de un plan de pago, y su protección gratuita deja público el dominio de producción.

## Decisión

- **En la propia app:** `apps/web/src/proxy.ts` (el «middleware» de Next.js 16) pide usuario y clave con HTTP Basic en `/cesvi` y todo lo que cuelgue de ahí. El resto del sitio sigue como estaba.
- **Credenciales en variables de entorno:** `CROQUIS_CESVI_USUARIO` y `CROQUIS_CESVI_CLAVE`, en Vercel (producción y vistas previas) y en `.env.local`, que no se versiona. La comparación no termina antes al primer carácter distinto.
- **Falla cerrada:** si en Vercel falta la clave, `/cesvi` responde 503 en lugar de quedar abierta. En desarrollo y en las pruebas, sin clave, abre sin pedir nada.
- **Lo que no muestra la página:** placas, VIN ni nombres; aparecen como «omitidas».

## Consecuencias

- **Para compartirla:** René pasa el usuario y la clave a quien vaya a ver la demo; los puede leer con `vercel env pull` o de `.env.local`, y cambiarlos sin tocar el código (`vercel env add … --force` y volver a desplegar).
- **Es acceso básico, no cuentas:** sirve para que el caso no quede público. Cuando haya peritos usando Croquis con sus propios casos, hará falta autenticación de verdad (en «Endurecimiento pendiente»).
