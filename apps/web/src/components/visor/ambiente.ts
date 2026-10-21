/**
 * Ambiente forzado en la vista desde la URL (ADR 0020): `clima`, `iluminacion`, `piso` y
 * `visibilidad` (m). Sirve para las capturas de clima y para ver una escena con otro tiempo; solo
 * cambia el dibujo. La escena y la reconstrucción no cambian, y la vista lo avisa.
 */
import { ESCENA_JSON_SCHEMA } from "@croquis/scene-schema";
import type { AmbienteVisual } from "@croquis/viewer/react";

type Defs = Record<string, { properties?: Record<string, { enum?: string[] }> }>;

function schemaEnum(defname: string): readonly string[] {
  const defs = (ESCENA_JSON_SCHEMA as unknown as { $defs: Defs }).$defs;
  return defs[defname]?.properties?.valor?.enum ?? [];
}

export const CLIMAS = schemaEnum("CampoClima");
export const ILUMINACIONES = schemaEnum("CampoIluminacion");
export const PISOS = schemaEnum("CampoEstadoSuperficie");

/** Lo que la URL fuerza; null si no fuerza nada válido. Lo desconocido se ignora. */
export function parseAmbiente(sp: URLSearchParams): AmbienteVisual | null {
  const out: AmbienteVisual = {};
  const clima = sp.get("clima");
  if (clima && CLIMAS.includes(clima)) out.clima = clima;
  const iluminacion = sp.get("iluminacion");
  if (iluminacion && ILUMINACIONES.includes(iluminacion)) out.iluminacion = iluminacion;
  const piso = sp.get("piso");
  if (piso && PISOS.includes(piso)) out.estadoSuperficie = piso;
  const v = Number(sp.get("visibilidad"));
  if (sp.get("visibilidad") !== null && Number.isFinite(v) && v > 0) out.visibilidadM = v;
  return Object.keys(out).length > 0 ? out : null;
}

const NOMBRES: Record<string, string> = {
  despejado: "despejado",
  nublado: "nublado",
  lluvia_ligera: "lluvia ligera",
  lluvia_fuerte: "lluvia fuerte",
  niebla: "niebla",
  granizo: "granizo",
  dia: "de día",
  amanecer: "amanecer",
  atardecer: "atardecer",
  noche_con_alumbrado: "noche con alumbrado",
  noche_sin_alumbrado: "noche sin alumbrado",
  seco: "seco",
  mojado: "mojado",
  encharcado: "encharcado",
  grava_suelta: "grava suelta",
  aceite: "con aceite",
  lodo: "con lodo",
};

const NAMES_EN: Record<string, string> = {
  despejado: "clear",
  nublado: "cloudy",
  lluvia_ligera: "light rain",
  lluvia_fuerte: "heavy rain",
  niebla: "fog",
  granizo: "hail",
  dia: "daytime",
  amanecer: "dawn",
  atardecer: "dusk",
  noche_con_alumbrado: "night with street lighting",
  noche_sin_alumbrado: "night without street lighting",
  seco: "dry",
  mojado: "wet",
  encharcado: "flooded",
  grava_suelta: "loose gravel",
  aceite: "oily",
  lodo: "muddy",
};

/** Texto del aviso en la vista, en el idioma de la página. */
export function describeAmbiente(a: AmbienteVisual, lang: "es" | "en" = "es"): string {
  const partes: string[] = [];
  if (lang === "en") {
    if (a.clima) partes.push(NAMES_EN[a.clima] ?? a.clima);
    if (a.iluminacion) partes.push(NAMES_EN[a.iluminacion] ?? a.iluminacion);
    if (a.estadoSuperficie)
      partes.push(`${NAMES_EN[a.estadoSuperficie] ?? a.estadoSuperficie} surface`);
    if (a.visibilidadM !== undefined) partes.push(`visibility ${a.visibilidadM} m`);
    return `Conditions changed only in the view: ${partes.join(", ")}. The reconstruction does not change.`;
  }
  if (a.clima) partes.push(NOMBRES[a.clima] ?? a.clima);
  if (a.iluminacion) partes.push(NOMBRES[a.iluminacion] ?? a.iluminacion);
  if (a.estadoSuperficie) partes.push(`piso ${NOMBRES[a.estadoSuperficie] ?? a.estadoSuperficie}`);
  if (a.visibilidadM !== undefined) partes.push(`visibilidad ${a.visibilidadM} m`);
  return `Ambiente cambiado solo en la vista: ${partes.join(", ")}. La reconstrucción no cambia.`;
}
