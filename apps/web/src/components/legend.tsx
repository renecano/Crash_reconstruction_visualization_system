"use client";
/**
 * Leyenda obligatoria (PLAN §10): se muestra en el visor, el croquis y toda exportación. En la
 * página va en su idioma; las exportaciones siguen usando `LEGEND_TEXT` de @croquis/scene-schema.
 * La semilla y el hash de entradas se agregan cuando existen.
 */
import { LEGEND_TEXT } from "@croquis/scene-schema";
// Solo el tipo: la leyenda va en muchas páginas y no debe traer el visor (three.js) consigo.
import type { VehicleCredit } from "@croquis/viewer";
import { textos } from "@/i18n";
import { useIdioma, useTextos } from "@/i18n/cliente";

// El texto vive en @croquis/scene-schema: lo comparten el visor, las exportaciones y el croquis.
export { LEGEND_TEXT };

const T = textos(
  {
    etiqueta: "Leyenda de reconstrucción ilustrativa",
    semilla: "semilla",
    osm: "Contiene información de OpenStreetMap, disponible en openstreetmap.org bajo la Open Database License (ODbL).",
    modelos: "Vehículos 3D:",
    de: "de",
  },
  {
    etiqueta: "Illustrative reconstruction notice",
    semilla: "seed",
    osm: "Contains information from OpenStreetMap, available at openstreetmap.org under the Open Database License (ODbL).",
    modelos: "3D vehicles:",
    de: "by",
  },
);

const LEYENDA_EN =
  "Illustrative reconstruction generated from a narrative. It is not a forensic report.";

export interface LegendProps {
  seed?: number | string;
  inputHash?: string;
  /** "clara" para fondos oscuros (sobre el visor 3D). */
  tone?: "normal" | "clara";
  /** Atribución de los datos del mapa (ODbL, ADR 0023) cuando la escena trae `red_vial`. */
  atribucion?: string;
  /** Atribución de los vehículos de Sketchfab que se ven (R10, CC-BY; ADR 0086). */
  modelos?: readonly VehicleCredit[];
  /** Otro texto en lugar del de la reconstrucción ilustrativa (en /cesvi, el de CESVI). */
  texto?: string;
}

export function Legend({
  seed,
  inputHash,
  tone = "normal",
  atribucion,
  modelos,
  texto: otro,
}: LegendProps) {
  const { lang } = useIdioma();
  const t = useTextos(T);
  const texto = otro ?? (lang === "es" ? LEGEND_TEXT : LEYENDA_EN);
  // La atribución de OSM se traduce si es la estándar; cualquier otra se muestra tal cual.
  const attr = atribucion
    ? atribucion.startsWith("Contiene información de OpenStreetMap")
      ? t.osm
      : atribucion
    : undefined;
  return (
    <p
      role="note"
      aria-label={t.etiqueta}
      className={`t-nota ${tone === "clara" ? "text-texto" : "text-texto-2"}`}
    >
      {texto}
      {seed !== undefined ? (
        <span className="cifras ml-2">
          {t.semilla} {String(seed)}
        </span>
      ) : null}
      {inputHash ? <span className="cifras ml-2">hash {inputHash.slice(0, 12)}</span> : null}
      {attr ? (
        <span className="block" data-testid="atribucion-mapa">
          {attr}
        </span>
      ) : null}
      {modelos?.length ? (
        <span className="block" data-testid="atribucion-modelos">
          {t.modelos}{" "}
          {modelos.map((c) => `«${c.modelo}» ${t.de} ${c.autor} (${c.licencia})`).join("; ")}
        </span>
      ) : null}
    </p>
  );
}

/**
 * Los textos de la marca para el croquis 2D en el idioma de la página. En español no cambia nada
 * (el croquis usa los de la escena, que son los de sus exportaciones).
 */
export function useTextosCroquis():
  { leyenda?: string; atribucion?: string; semilla?: string } | undefined {
  const { lang } = useIdioma();
  const t = useTextos(T);
  return lang === "es" ? undefined : { leyenda: LEYENDA_EN, atribucion: t.osm, semilla: t.semilla };
}
