/**
 * El objeto que nombra la narración aparece solo (René, 2026-11-28: en el ejemplo del poste, «hasta un
 * poste … contra el cual se impactó» nunca salía en La escena ni en el 3D si el perito no lo marcaba).
 *
 * Un choque posterior contra un objeto fijo (orden > 1, un vehículo, sin lugar marcado) va donde quedó
 * ese vehículo, contra su cara de contacto: es el final del derrape, donde lo detuvo el objeto. Es un
 * supuesto visible (los límites lo dicen) y el perito lo mueve si fue en otro lugar; al moverlo, el
 * lugar es suyo y esto ya no lo toca. Sin el reposo del vehículo todavía, no se coloca.
 */
import type { Expediente } from "./corpus";
import { avanzar, enMetros } from "./geo";

const ll = (p: { lat: number; lon: number }): [number, number] => [p.lon, p.lat];
import { OBJETO_PERSONA } from "./personas";
import { medidasDe } from "./poses-impacto";

/**
 * m: cuánto entra el objeto en la cara del vehículo, que se impactó contra él y quedó en contacto
 * (supuesto). Con el objeto justo en la defensa, el vehículo lo tocaba o no según unos centímetros de
 * su reposo y la cifra saltaba de 49 a 125 km/h (René, 2026-11-28); con el hundimiento, el golpe
 * ocurre y la cifra es estable.
 */
export const HUNDIMIENTO_SUPUESTO_M = 0.6;

const GIRO_CARA: Record<string, number> = {
  frontal: 0,
  posterior: 180,
  lateral_izquierdo: -90,
  lateral_derecho: 90,
};

export interface ObjetoNarradoColocado {
  orden: number;
  vehiculo: string;
  objeto: string;
  /** Para los límites y La escena: dónde lo puso Croquis y por qué. */
  texto: string;
}

/** Los objetos narrados que Croquis coloca, con el expediente que ya los trae en su impacto. */
export function conObjetosNarrados(e: Expediente): {
  expediente: Expediente;
  colocados: ObjetoNarradoColocado[];
} {
  const posiciones = e.versiones?.find((v) => v.tipo === "evidencia")?.posiciones ?? [];
  const colocados: ObjetoNarradoColocado[] = [];
  const impactos = (e.impactos ?? []).map((imp) => {
    if (
      (imp.orden ?? 1) <= 1 ||
      imp.punto ||
      !imp.objeto_fijo ||
      OBJETO_PERSONA.test(imp.objeto_fijo) ||
      (imp.vehiculos ?? []).length !== 1
    )
      return imp;
    const vehiculo = String(imp.vehiculos![0]);
    const final = posiciones.find((p) => p.vehiculo === vehiculo && p.fase === "final");
    const v = e.vehiculos.find((x) => x.id === vehiculo);
    if (!final?.punto || !v) return imp;
    const cara = imp.zonas?.find((z) => z.vehiculo === vehiculo)?.zona.cara ?? "frontal";
    const { largo, ancho } = medidasDe(v);
    const lateral = cara === "lateral_izquierdo" || cara === "lateral_derecho";
    const distancia = Math.max(0.3, (lateral ? ancho : largo) / 2 - HUNDIMIENTO_SUPUESTO_M);
    // Llega al objeto por su recorrido, del choque anterior a donde quedó: el frente va hacia allá (no
    // hacia su rumbo final, que puede girar al detenerse). Sin choque anterior, su rumbo final.
    const antes = posiciones.find((p) => p.vehiculo === vehiculo && p.fase === "impacto");
    const recorrido = antes ? enMetros(ll(antes.punto), ll(final.punto)) : null;
    const haciaDonde =
      cara === "frontal" && recorrido && Math.hypot(recorrido.este, recorrido.norte) > 1
        ? (Math.atan2(recorrido.este, recorrido.norte) * 180) / Math.PI
        : (final.rumbo ?? 0) + (GIRO_CARA[cara] ?? 0);
    const [lon, lat] = avanzar(ll(final.punto), haciaDonde, distancia);
    const nombre = `${imp.objeto_fijo[0]!.toUpperCase()}${imp.objeto_fijo.slice(1)}`;
    colocados.push({
      orden: imp.orden,
      vehiculo,
      objeto: imp.objeto_fijo,
      texto: `${nombre} (impacto ${imp.orden}): la narración no dice dónde está; Croquis lo pone donde quedó el vehículo ${letra(vehiculo)}, contra su ${CARA_TEXTO[cara] ?? "frente"}, al final de su recorrido, con un hundimiento de ${HUNDIMIENTO_SUPUESTO_M} m (supuestos; muévelo si fue en otro lugar).`,
    });
    return { ...imp, punto: { lat, lon } };
  });
  return colocados.length
    ? { expediente: { ...e, impactos }, colocados }
    : { expediente: e, colocados };
}

/** «V2» → «B», como los nombra la narración. */
const letra = (id: string) =>
  /^V\d+$/.test(id) ? String.fromCharCode(64 + Number(id.slice(1))) : id;

const CARA_TEXTO: Record<string, string> = {
  frontal: "frente",
  posterior: "parte trasera",
  lateral_izquierdo: "costado izquierdo",
  lateral_derecho: "costado derecho",
};
