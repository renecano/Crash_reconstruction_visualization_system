/**
 * Una volcadura sin choque contra nada (René, 2026-11-28): Croquis todavía no la reconstruye. En vez de
 * preguntar «¿contra qué chocó?» y armar un choque contra un objeto inventado, lo dice y deja usar el
 * croquis y el dictamen sin cifra de velocidad. Reconstruirla bien (derrape, tropiezo y vueltas, cada
 * fase con su arrastre y su fuente; el reposo sobre el techo; las vueltas en el 3D) queda para después
 * de la demo (`docs/PROGRESS.md`, «Endurecimiento pendiente»).
 */
import type { Expediente } from "./corpus";

export const AVISO_VOLCADURA =
  "Croquis todavía no reconstruye volcaduras: puedes usar el croquis y el dictamen sin cifra de velocidad.";

/** Sin acentos ni mayúsculas: las marcas diacríticas (`\p{M}`) que deja NFD, fuera. */
const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/** El vuelco narrado («volcó», «se volteó», «dio varias vueltas», «quedó sobre su techo»). */
const RX_VUELCO =
  /\b(volc[oóa]\w*|vuelc\w*|volcadura|se volte\w*|dio (?:una |varias |dos |tres )?vueltas|giros? sobre su eje|sobre su (?:toldo|techo)|sobre el (?:toldo|techo)|llantas hacia arriba)/;
/** Un choque contra algo o alguien («se impactó contra un poste», «chocó con la barda»). */
const RX_CONTRA =
  /\b(impact\w*|choc\w*|golpe\w*|colision\w*|embist\w*|pego|atropell\w*)\b[^.]{0,60}?\b(contra|con|a)\s+(un|una|el|la|los|las|otro|otra)\b/;

/** Un impacto con algo o alguien más: otro vehículo, una persona o un objeto. */
const conAlgo = (e: Expediente) =>
  (e.impactos ?? []).some(
    (i) => Boolean(i.objeto_fijo) || Boolean(i.persona) || (i.vehiculos ?? []).length >= 2,
  );

/** La narración describe una volcadura de un solo vehículo, sin choque contra nada. */
export function narraVolcaduraSinChoque(
  e: Expediente,
  narracion: string | null | undefined,
): boolean {
  if (!narracion || e.vehiculos.length !== 1 || conAlgo(e)) return false;
  const n = normalizar(narracion);
  return RX_VUELCO.test(n) && !RX_CONTRA.test(n);
}

/** El caso es una volcadura sin choque (por su modalidad, sin impactos con algo): no se calcula. */
export function volcaduraSinChoque(e: Expediente): boolean {
  return (
    e.vehiculos.length === 1 && (e.caso.modalidades ?? []).includes("volcadura") && !conAlgo(e)
  );
}

/** Con la modalidad «volcadura» (la lee de la narración, si no la traía) y sin ningún impacto. */
export function comoVolcaduraSinChoque(e: Expediente): Expediente {
  const modalidades = e.caso.modalidades ?? [];
  return {
    ...e,
    caso: {
      ...e.caso,
      modalidades: modalidades.includes("volcadura")
        ? modalidades
        : [...modalidades.filter((m) => m !== "otra"), "volcadura"],
    },
    impactos: [],
  };
}
