import { conPosicion, impactosEncimados, type Expediente } from "@croquis/cesvi";
import { elegirDireccion, finalDeLaNarracion, marcarFinal, poseDe } from "./escena-facil";
import { impactosAColocar } from "./pasos-caso";

/**
 * Las tres narraciones que René probó en producción (2026-11-24), como paquete caso-3d para la
 * batería de Unity y la e2e de la t9. Parten de su caso guardado (`data/cesvi/casos/rene-*.croquis`: sus choques donde
 * él los marcó) y rehacen La escena con las funciones corregidas, como la haría el perito hoy: «Por
 * dónde venía» con la vuelta dada (el camión) y el peatón en el punto de contacto, «Separarlos» si
 * quedaron encimados, y «Como dice la narración» para dónde quedó cada uno.
 */
export function rehacerLaEscena(
  guardado: Expediente,
  narradas: readonly { vehiculo: string; fase: string; descripcion: string }[],
): Expediente {
  let e: Expediente = {
    ...guardado,
    versiones: (guardado.versiones ?? []).map((v) => ({
      ...v,
      posiciones: (v.posiciones ?? []).filter((p) => p.fase !== "final"),
    })),
  };
  const impactos = impactosAColocar(e);
  const punto = (orden: number) => {
    const vs = impactos.find((i) => i.orden === orden)?.vehiculos ?? [];
    const ps = vs.flatMap((v) => poseDe(guardado, v, "impacto") ?? []);
    return ps.length
      ? {
          lat: ps.reduce((a, p) => a + p.punto.lat, 0) / ps.length,
          lon: ps.reduce((a, p) => a + p.punto.lon, 0) / ps.length,
        }
      : null;
  };
  // Su dirección de llegada, como la marcó (antes la pose guardaba la llegada tal cual).
  for (const i of impactos) {
    const v = i.vehiculos[0]!;
    const pose = poseDe(guardado, v, "impacto");
    if (pose) e = elegirDireccion(e, impactos, v, pose.rumbo, punto);
  }
  for (const enc of impactosEncimados(e))
    for (const pose of enc.propuesta) e = conPosicion(e, { ...pose, fase: "impacto" });
  const finales = narradas.filter((p) => p.fase === "final");
  for (const n of finales) {
    const f = finalDeLaNarracion(e, n.vehiculo, n.descripcion, finales);
    const suyo = poseDe(guardado, n.vehiculo, "final");
    if (f) e = marcarFinal(e, n.vehiculo, f.punto, f.rumbo);
    else if (suyo) e = marcarFinal(e, n.vehiculo, suyo.punto, suyo.rumbo);
  }
  return e;
}
