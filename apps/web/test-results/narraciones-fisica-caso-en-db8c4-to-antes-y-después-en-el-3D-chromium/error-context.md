# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: narraciones-fisica.spec.ts >> caso encimado a propósito: antes y después en el 3D
- Location: e2e\narraciones-fisica.spec.ts:149:5

# Error details

```
Test timeout of 900000ms exceeded.
```

```
Error: Sin el panel de pasos en la página (se pedía el paso 3)

expect(locator).toBeAttached() failed

Locator:  getByTestId('panel-paso')
Expected: attached
Received: undefined

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - link "Todos los casos" [ref=e4] [cursor=pointer]:
        - /url: /cesvi
        - img "Croquis" [ref=e5]
      - link "← Casos" [ref=e6] [cursor=pointer]:
        - /url: /cesvi
      - generic [ref=e7]: Encimados a propósito
      - navigation "Actos del recorrido" [ref=e8]:
        - list [ref=e9]:
          - listitem [ref=e10]:
            - 'button "Acto 1: El hecho" [ref=e11] [cursor=pointer]':
              - generic [ref=e12]: El hecho
          - listitem [ref=e13]:
            - 'button "Acto 2: La escena" [ref=e14] [cursor=pointer]':
              - generic [ref=e15]: La escena
          - listitem [ref=e16]:
            - 'button "Acto 3: Reconstrucción" [ref=e17] [cursor=pointer]':
              - generic [ref=e18]: Reconstrucción
          - listitem [ref=e19]:
            - 'button "Acto 4: Versiones" [ref=e20] [cursor=pointer]':
              - generic [ref=e21]: Versiones
          - listitem [ref=e22]:
            - 'button "Acto 5: Análisis" [ref=e23] [cursor=pointer]':
              - generic [ref=e24]: Análisis
          - listitem [ref=e25]:
            - 'button "Acto 6: Dictamen" [ref=e26] [cursor=pointer]':
              - generic [ref=e27]: Dictamen
      - generic [ref=e31]: "Paso 4 de 8: La reconstrucción"
      - tablist "Modo" [ref=e32]:
        - tab "Presentar" [ref=e33] [cursor=pointer]
        - tab "Trabajar" [selected] [ref=e34] [cursor=pointer]
      - button "Cambiar a tema oscuro" [ref=e35] [cursor=pointer]: ◐
      - button "Apagar las transiciones entre actos" [pressed] [ref=e36] [cursor=pointer]: ✦
      - button "Exportar" [ref=e37] [cursor=pointer]
    - generic [ref=e38]:
      - main "La reconstrucción" [ref=e39]:
        - paragraph [ref=e40]: Acto 3 de 6 · Reconstrucción
        - generic [ref=e41]:
          - generic [ref=e42]:
            - button "Repetir" [ref=e44] [cursor=pointer]
            - heading "Velocidad antes del impacto" [level=2] [ref=e45]
            - paragraph [ref=e46]:
              - generic [ref=e47]: "13"
              - generic [ref=e48]:
                - generic [ref=e49]: km/h
                - generic [ref=e50]: A · VW Jetta
                - generic [ref=e51]: rango 2–36
            - paragraph [ref=e52]: Reconstrucción física de Croquis · mejor ajuste
            - generic [ref=e53]:
              - list "Simulaciones por velocidad" [ref=e55]:
                - 'listitem "0–1 km/h: 3 simulaciones, fuera del rango del 80 %" [ref=e56]'
                - 'listitem "1–2 km/h: 1 simulación, dentro del rango del 80 %" [ref=e60]'
                - 'listitem "2–3 km/h: 1 simulación, dentro del rango del 80 %" [ref=e62]'
                - 'listitem "3–4 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e64]'
                - 'listitem "4–5 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e65]'
                - 'listitem "5–6 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e66]'
                - 'listitem "6–7 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e67]'
                - 'listitem "7–8 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e68]'
                - 'listitem "8–9 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e69]'
                - 'listitem "9–10 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e70]'
                - 'listitem "10–11 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e71]'
                - 'listitem "11–12 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e72]'
                - 'listitem "12–13 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e73]'
                - 'listitem "13–14 km/h: 1 simulación, dentro del rango del 80 %" [ref=e74]'
                - 'listitem "14–15 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e76]'
                - 'listitem "15–16 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e77]'
                - 'listitem "16–17 km/h: 2 simulaciones, dentro del rango del 80 %" [ref=e78]'
                - 'listitem "17–18 km/h: 2 simulaciones, dentro del rango del 80 %" [ref=e81]'
                - 'listitem "18–19 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e84]'
                - 'listitem "19–20 km/h: 1 simulación, dentro del rango del 80 %" [ref=e85]'
                - 'listitem "20–21 km/h: 2 simulaciones, dentro del rango del 80 %" [ref=e87]'
                - 'listitem "21–22 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e90]'
                - 'listitem "22–23 km/h: 1 simulación, dentro del rango del 80 %" [ref=e91]'
                - 'listitem "23–24 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e93]'
                - 'listitem "24–25 km/h: 1 simulación, dentro del rango del 80 %" [ref=e94]'
                - 'listitem "25–26 km/h: 1 simulación, dentro del rango del 80 %" [ref=e96]'
                - 'listitem "26–27 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e98]'
                - 'listitem "27–28 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e99]'
                - 'listitem "28–29 km/h: 2 simulaciones, dentro del rango del 80 %" [ref=e100]'
                - 'listitem "29–30 km/h: 1 simulación, dentro del rango del 80 %" [ref=e103]'
                - 'listitem "30–31 km/h: 1 simulación, dentro del rango del 80 %" [ref=e105]'
                - 'listitem "31–32 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e107]'
                - 'listitem "32–33 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e108]'
                - 'listitem "33–34 km/h: 7 simulaciones, dentro del rango del 80 %" [ref=e109]'
                - 'listitem "34–35 km/h: 0 simulaciones, dentro del rango del 80 %" [ref=e117]'
                - 'listitem "35–36 km/h: 3 simulaciones, dentro del rango del 80 %" [ref=e118]'
                - 'listitem "36–37 km/h: 0 simulaciones, fuera del rango del 80 %" [ref=e122]'
                - 'listitem "37–38 km/h: 0 simulaciones, fuera del rango del 80 %" [ref=e123]'
                - 'listitem "38–39 km/h: 0 simulaciones, fuera del rango del 80 %" [ref=e124]'
                - 'listitem "39–40 km/h: 0 simulaciones, fuera del rango del 80 %" [ref=e125]'
                - 'listitem "40–41 km/h: 0 simulaciones, fuera del rango del 80 %" [ref=e126]'
                - 'listitem "41–42 km/h: 0 simulaciones, fuera del rango del 80 %" [ref=e127]'
                - 'listitem "42–43 km/h: 0 simulaciones, fuera del rango del 80 %" [ref=e128]'
                - 'listitem "43–44 km/h: 2 simulaciones, fuera del rango del 80 %" [ref=e129]'
              - generic [ref=e132]:
                - generic [ref=e136]: "0"
                - generic [ref=e137]: "5"
                - generic [ref=e138]: "10"
                - generic [ref=e139]: "15"
                - generic [ref=e140]: "20"
                - generic [ref=e141]: "25"
                - generic [ref=e142]: "30"
                - generic [ref=e143]: "35"
                - generic [ref=e144]: "40"
                - generic [ref=e145]: km/h
              - paragraph [ref=e146]: "Cada punto es una de las 32 simulaciones, al contacto: el mismo choque con lo incierto dentro de su rango. El corchete marca donde cae el 80 %. mejor ajuste."
            - group [ref=e148]:
              - generic "Los percentiles de las simulaciones" [ref=e149] [cursor=pointer]
            - generic [ref=e150]:
              - generic [ref=e151]:
                - term [ref=e152]: B · GM Camaro
                - definition [ref=e153]: 13 km/h
              - generic [ref=e154]:
                - term [ref=e155]: Lo fijan
                - definition [ref=e156]: 4 evidencias
          - button "Comparar con una versión" [ref=e157] [cursor=pointer]
          - group [ref=e158]:
            - 'generic "Ver el detalle: velocidades, evidencia y límites" [ref=e159] [cursor=pointer]'
        - generic [ref=e160]:
          - status [ref=e161]:
            - paragraph [ref=e162]:
              - generic [ref=e163]: A · VW Jetta y B · GM Camaro quedaron encimados
              - text: en su posición final (1.47 m). Dos vehículos en reposo no ocupan el mismo lugar.
            - button "Separarlos" [ref=e164] [cursor=pointer]
          - status [ref=e165]:
            - paragraph [ref=e166]:
              - generic [ref=e167]: El choque entre A · VW Jetta y B · GM Camaro casi no transfiere energía
              - text: "con estas velocidades: los dos llegan casi igual de rápido en el mismo sentido y no queda daño. Di a qué velocidad venía cada uno o revisa por dónde venían."
          - generic [ref=e168]:
            - button "Anterior" [ref=e169] [cursor=pointer]: ←
            - button "Continuar a las versiones" [ref=e170] [cursor=pointer]:
              - text: Continuar a las versiones
              - generic [aria-hidden] [ref=e171]: →
      - region "Mapa" [ref=e172]:
        - region "Vista 3D del caso" [ref=e173]:
          - generic [ref=e174]:
            - generic [ref=e175]:
              - tablist "Vista" [ref=e177]:
                - tab "3D" [selected] [ref=e178] [cursor=pointer]
                - tab "2D" [ref=e179] [cursor=pointer]
              - group "Cámara" [ref=e181]:
                - button "Alrededor" [ref=e183] [cursor=pointer]
                - button "Desde arriba" [ref=e184] [cursor=pointer]
                - button "Cinematográfica" [ref=e185] [cursor=pointer]
                - button "Desde la acera" [ref=e186] [cursor=pointer]
                - button "A · VW Jetta" [ref=e189] [cursor=pointer]:
                  - text: A · VW Jetta
                  - generic [aria-hidden] [ref=e190]: ▾
                - button "B · GM Camaro" [ref=e192] [cursor=pointer]:
                  - text: B · GM Camaro
                  - generic [aria-hidden] [ref=e193]: ▾
            - generic [ref=e194]:
              - generic [ref=e195]:
                - button "Ocultar minimapa" [pressed] [ref=e196] [cursor=pointer]
                - button "Descargar video" [ref=e197] [cursor=pointer]
                - button "Editar en 3D" [ref=e198] [cursor=pointer]
                - button "Mapa real" [ref=e199] [cursor=pointer]
                - button "Descargar paquete 3D" [ref=e200] [cursor=pointer]
              - button "Pantalla completa · F" [ref=e201] [cursor=pointer]
          - generic [ref=e210]:
            - button "Pausar" [ref=e211] [cursor=pointer]: ❚❚
            - generic [ref=e212]:
              - slider "Instante de la reconstrucción" [ref=e213] [cursor=pointer]: "3.43"
              - generic [ref=e214]:
                - generic [ref=e215]: Llegada
                - generic [ref=e216]: Impacto · t +3.43 s
                - generic [ref=e217]: Reposo final
            - group "Velocidad de reproducción" [ref=e218]:
              - button "¼×" [ref=e219] [cursor=pointer]
              - button "½×" [ref=e220] [cursor=pointer]
              - button "1×" [pressed] [ref=e221] [cursor=pointer]
            - generic [ref=e222]:
              - button "Ir al impacto" [ref=e223] [cursor=pointer]
              - button "Ver todo" [ref=e224] [cursor=pointer]
              - button "Repetir" [active] [ref=e225] [cursor=pointer]
          - group [ref=e226]:
            - generic "Supuestos y notas del cálculo" [ref=e227] [cursor=pointer]
  - alert [ref=e228]
```

# Test source

```ts
  1   | /** Ayudas de las e2e del recorrido de los casos (V2, ADR 0080). */
  2   | import { expect, type Page } from "@playwright/test";
  3   | import { Fuente, FuenteExpediente } from "@croquis/scene-schema";
  4   | import { FUENTE, palabra } from "../src/i18n/vocabulario";
  5   | 
  6   | /**
  7   |  * Lleva el recorrido al paso n (1 a 8 del recorrido completo) con «Siguiente» y «Anterior». En La
  8   |  * escena (paso 3) al trabajar, la escena fácil ocupa la pantalla: se sale con «Ver la
  9   |  * reconstrucción» o con la barra de actos.
  10  |  */
  11  | export async function irAPaso(page: Page, n: number) {
  12  |   const panel = page.getByTestId("panel-paso");
  13  |   for (let k = 0; k < 10; k++) {
  14  |     // t8 (2026-11-24): sin el panel, la lectura esperaba hasta el tope de la prueba (15 min).
> 15  |     await expect(panel, `Sin el panel de pasos en la página (se pedía el paso ${n})`).toBeAttached({
      |                                                                                       ^ Error: Sin el panel de pasos en la página (se pedía el paso 3)
  16  |       timeout: 30_000,
  17  |     });
  18  |     const actual = Number(await panel.getAttribute("data-paso"));
  19  |     if (actual === n) return;
  20  |     if (actual === 3 && (await page.getByTestId("escena-facil").isVisible())) {
  21  |       if (n > 3) {
  22  |         // Ronda 4 (René, 2026-11-20): La escena nueva (la lista de la propuesta 1) no tiene la barra
  23  |         // de pasos; «Ver la reconstrucción» va dentro del panel. La guía («Entendido») se cierra.
  24  |         const lista = page.getByTestId("lista-escena");
  25  |         if (await lista.isVisible().catch(() => false)) {
  26  |           const guia = page.getByTestId("cerrar-guia");
  27  |           if (await guia.isVisible().catch(() => false)) await guia.click();
  28  |           const ver = page.getByTestId("lista-ver-reconstruccion");
  29  |           await expect(ver, `La escena no deja seguir: ${await lista.innerText()}`).toBeEnabled({
  30  |             timeout: 30_000,
  31  |           });
  32  |           await ver.click();
  33  |         } else {
  34  |           const ver = page.getByTestId("avance-ver-reconstruccion");
  35  |           const falta = page.getByTestId("avance-falta");
  36  |           await expect(
  37  |             ver,
  38  |             `La escena no deja seguir: ${(await falta.isVisible().catch(() => false)) ? await falta.textContent() : "sin aviso"}`,
  39  |           ).toBeEnabled({ timeout: 30_000 });
  40  |           await ver.click();
  41  |         }
  42  |       } else await page.getByTestId("paso-1").click();
  43  |       await expect(panel).not.toHaveAttribute("data-paso", "3");
  44  |       continue;
  45  |     }
  46  |     const boton = page.getByTestId(actual < n ? "siguiente" : "anterior");
  47  |     await expect(boton).toBeEnabled();
  48  |     await boton.click();
  49  |     // «El trazo» (A1) se recoge antes de pasar a la narración: se espera el cambio de paso.
  50  |     await expect(panel).not.toHaveAttribute("data-paso", String(actual), { timeout: 3000 });
  51  |   }
  52  |   await expect(panel).toHaveAttribute("data-paso", String(n));
  53  | }
  54  | 
  55  | /**
  56  |  * En CI no se consulta la red: las calles de OpenStreetMap y la búsqueda del lugar responden vacío (lo
  57  |  * mismo que hace la app si no responden). La escena fácil ofrece entonces las flechas por puntos
  58  |  * cardinales.
  59  |  */
  60  | export async function sinRed(page: Page) {
  61  |   await page.route("**/api/osm?**", (r) => r.fulfill({ json: { elements: [] } }));
  62  |   await page.route("**/api/lugar?**", (r) => r.fulfill({ json: { resultados: [] } }));
  63  | }
  64  | 
  65  | /** El mapa de la escena fácil, listo, al trabajar (un reporte de la reproducción abre al presentar). */
  66  | export async function mapaFacil(page: Page) {
  67  |   const recorrido = page.getByTestId("recorrido-caso");
  68  |   if ((await recorrido.getAttribute("data-modo")) === "presentar")
  69  |     await page.getByTestId("modo-trabajar").click();
  70  |   const mapa = page.getByTestId("mapa-facil");
  71  |   await expect(mapa).toHaveAttribute("data-listo", "si", { timeout: 30_000 });
  72  |   return mapa;
  73  | }
  74  | 
  75  | /**
  76  |  * Toca el mapa de la escena fácil a (este, norte) metros del centro de un marcador (`choque-1`…):
  77  |  * con la escala que el mapa publica en `data-m-por-px`.
  78  |  */
  79  | export async function tocarEnMetros(page: Page, desde: string, este: number, norte: number) {
  80  |   const mapa = page.getByTestId("mapa-facil");
  81  |   await expect(mapa).toHaveAttribute("data-m-por-px", /\d/);
  82  |   await page.waitForTimeout(700); // el mapa termina de moverse
  83  |   const m = Number(await mapa.getAttribute("data-m-por-px"));
  84  |   const caja = (await mapa.boundingBox())!;
  85  |   const ref = (await page.getByTestId(desde).boundingBox())!;
  86  |   await mapa.click({
  87  |     position: {
  88  |       x: ref.x + ref.width / 2 + este / m - caja.x,
  89  |       y: ref.y + ref.height / 2 - norte / m - caja.y,
  90  |     },
  91  |   });
  92  | }
  93  | 
  94  | /**
  95  |  * Las tres preguntas de C1 (W3) y la del terreno (C3, W5), con el botón que las contesta sin agregar
  96  |  * evidencia: «No sé» dónde fue el primer golpe, «No» chocó contra algo más, seguir sin puntos de
  97  |  * paso y «Es pavimento liso».
  98  |  */
  99  | const BOTON_C1: [RegExp, string][] = [
  100 |   [/primer golpe/, "golpe-nose"],
  101 |   [/algo más/, "otros-no"],
  102 |   [/por dónde pasó/, "paso-listo"],
  103 |   [/Cómo es el terreno/, "terreno-liso"],
  104 | ];
  105 | 
  106 | /**
  107 |  * Después de colocar a mano los vehículos de un caso nuevo: contesta las tres preguntas de C1 con lo
  108 |  * que no agrega evidencia, hasta «¡La escena está lista!». En una escena que llega completa no se
  109 |  * preguntan y no hace nada.
  110 |  */
  111 | export async function contestarC1(page: Page) {
  112 |   const lista = page.getByTestId("escena-lista");
  113 |   const pregunta = page.getByTestId("escena-pregunta");
  114 |   for (let k = 0; k < BOTON_C1.length; k++) {
  115 |     // La pregunta anterior tarda un instante en cambiar: se espera a la lista o a una de C1.
```