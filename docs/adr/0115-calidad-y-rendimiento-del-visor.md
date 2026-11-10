# ADR 0115 — U5: calidad y rendimiento del visor Unity

- **Fecha:** 2026-11-10
- **Estado:** aceptada
- **Contexto:** El plan v4 (§3.3, U5) pide los cuatro niveles de `PLAN.md` §7.8 en el visor Unity, la calidad automática con las reglas de la web (nunca sube; baja un nivel si los fps quedan debajo de 24 durante 5 s; con tope de dpr), un panel de diagnóstico y la medición: en la laptop, el build WebGL en media; en una computadora con tarjeta de video, el de escritorio en alta y ultra. El presupuesto de §7.8 es media ≥ 60 fps y baja ≥ 30 fps a 1080p en la laptop, y ≥ 60 fps en alta o ultra en la computadora de demo. Hasta U4 había dos ajustes fijos por destino del build: «media» en la web y «alta» en el escritorio.

## Decisiones

1. **Cuatro niveles de `QualitySettings`, cada uno con su canalización URP** (`ConstruirVisor.Niveles`): `URP_baja`, `URP_media`, `URP.asset` (alta, el de antes) y `URP_ultra`. Los dos builds llevan los cuatro; el nivel se cambia en tiempo de ejecución sin recargar.
   - **Media y alta son los ajustes que ya tenían** el build web y el de escritorio en U2: pasarlos a niveles no cambia su aspecto.
   - **Baja** recorta densidad, no funciones: sombras del sol a 50 m en una cascada, sin MSAA, sin oclusión ni resplandor, dpr 0.75, la mitad de matas y dos luminarias con luz real. Faros, alumbrado, lluvia, evidencias y marcadores siguen en los cuatro niveles (prueba `CadaNivelTieneAlMenosLoDelDeAbajo`).
   - **Ultra** agrega sobre alta: sombras a 150 m, suavizado de sombra alto, mapa de sombras de focos de 4096, sonda de 512, dpr hasta 2, más matas y ocho luminarias con luz.
   - **Los perfiles viven en el núcleo** (`Croquis.Core.Calidades`), sin Unity, y se prueban con `dotnet test`.
2. **Lo del escenario se lee al armar el caso** (matas, luminarias con luz, focos por faro, sonda); la canalización (sombras, MSAA, luces, oclusión, resplandor, escala) cambia de inmediato. Si el automático baja a media sesión, el escenario toma el nivel nuevo al cargar el siguiente caso.
3. **Calidad automática con las reglas de la web** (`CalidadAutomatica`): arranca en media en la web; en el escritorio, en alta con tarjeta dedicada y en media con una integrada; en teléfono, en baja. Ultra solo se elige a mano. Nunca sube; baja un nivel cuando los fps de una ventana de 5 s quedan debajo de 24, y vuelve a medir desde cero. La carga del caso y los cuadros de más de 1 s no cuentan.
4. **Tope de dpr por nivel** (baja 0.75, media 1, alta 1.5, ultra 2): la escala de dibujo de URP es `min(1, tope / dpr de la pantalla)`. Nunca sobremuestrea. La página del build limita el lienzo a dpr 2.
5. **El puente no cambia:** `calidad` ya estaba en el contrato 1.1.0 (`baja`, `media`, `alta`, `ultra`, `auto`). Fijar un nivel apaga el automático; `auto` lo vuelve a encender desde el nivel actual.
6. **Panel de diagnóstico** (`PanelDiagnostico`), para medir y para soporte, no para el perito: nivel y por qué bajó, fps y tiempo de cuadro, pantalla, dpr y escala, sombras, MSAA, luces, GPU, llamadas de dibujo y memoria. Se abre con F3, con `?diagnostico=1`, con `-diagnostico` en el escritorio o con `depurar` `{"diagnostico": true}`.
7. **Medición con el protocolo de E6** (ADR 0026): navegador nuevo por medición, sin vsync, tres repeticiones en orden alterno, mediana, modo «Mejor rendimiento» y condiciones registradas.
   - **Web:** `eval/e6_unity.mjs` → `eval/results/e6_unity_web.json`, a 1920×1080, con el nivel fijo y la cámara cinematográfica en bucle.
   - **Escritorio:** el mismo programa mide si se abre con `-caso` (`Medicion`); `tools/unity/medir-escritorio.ps1` corre un proceso por medición y escribe `e6_unity_escritorio.json`. `tools/unity/paquete-escritorio.ps1` arma el paquete que se corre en la computadora con tarjeta de video.
8. **El escritorio se compila con Mono, no con IL2CPP.** IL2CPP necesita las herramientas de C++ de Visual Studio, que la laptop de desarrollo no tiene. Lo que se mide es el costo de la GPU, que no depende del backend de scripts.

## Consecuencias

- El build WebGL lleva las variantes de shader de los cuatro niveles (por ejemplo, sombras de focos de alta); su peso se mide en U5 y queda en `docs/progress/U.md`.
- La meta de alta y ultra (≥ 60 fps en la computadora de demo) queda en «Bloqueado — necesita a René» hasta que corra el paquete.
