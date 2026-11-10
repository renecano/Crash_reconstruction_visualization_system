# ADR 0132 — W6: el encuadre de la maqueta en 2D

- **Fecha:** 2026-11-10
- **Estado:** aceptada
- **Contexto:** CESVI observó (O3, plan v4 §0.2) que en Reconstrucción no se ve la zona completa ni hay forma de ir a la zona de interés. Hasta hoy la maqueta del caso tenía un encuadre fijo alrededor del impacto: los últimos 2.5 s de cada vehículo y su reposo, con la trayectoria de antes fuera del cuadro. La fase W6 pide ajuste automático, zoom y desplazamiento con ratón, rueda y dedos, «Ver todo» e «Ir al impacto», escala gráfica y norte, en Reconstrucción, Análisis y Contra CESVI.

## Decisiones

1. **La maqueta abre con «Ver todo».** Es la caja de las trayectorias completas, los reposos, el punto de impacto, la evidencia física con puntos, los puntos de paso, los objetos del lugar y los topes, con 8 m de margen y al menos 30 m por lado.
   - Las zonas de superficie del terreno no cuentan: una de «todo el lugar» mide 400 m y se comería el encuadre.
2. **«Ir al impacto» es el encuadre de antes,** sin cambios (`encuadre` de `maqueta.ts`).
3. **Límites:** no se acerca a menos de 6 m por lado ni se aleja a más de 4 veces «Ver todo» (ni a más de 3 km). Al desplazar, el centro no se aleja más de media vista de la orilla de «Ver todo»: algo de la escena queda siempre a la vista.
4. **La vista guarda la proporción del contenedor.** Así lo que dice el SVG (`data-vista`) es exactamente lo que se ve, y la escala gráfica sale del ancho en pixeles sin medir la matriz de pantalla.
5. **Las letras guardan su tamaño en pantalla** al acercar y alejar: su tamaño va con lo que se ve. Los trazos (trayectorias, vehículos, topes) siguen a escala real.
6. **La escala gráfica y el norte van en HTML**, arriba a la derecha junto a los botones, no dentro del SVG: así ningún panel de la etapa los tapa.
7. **Dónde no navega:** el croquis del dictamen y Presentar conservan el encuadre fijo alrededor del impacto. El dictamen es un documento: su imagen no debe depender de dónde dejó el perito la vista.
8. **Se vuelve a «Ver todo»** cuando llega otro resultado (una reconstrucción nueva o un recálculo).

## Consecuencias

- `apps/web/src/lib/vista-maqueta.ts` lleva la lógica sin interfaz, con su prueba unitaria; `EscenaMaqueta` gana la propiedad `navegable`.
- Con «Ver todo», en un caso con aproximación larga los vehículos se ven más chicos que antes al abrir. «Ir al impacto» da la vista de antes con un clic.
