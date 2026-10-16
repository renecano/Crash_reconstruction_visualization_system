import type { Resultado } from "@croquis/scene-schema";
import type { PeopleAttachment } from "@croquis/viewer";
import { fmtNumber } from "@/lib/format-number";

const ROL: Record<string, string> = {
  conductor: "Conductor",
  pasajero: "Pasajero",
  peaton: "Persona peatona",
  ciclista: "Ciclista",
  motociclista: "Motociclista",
};

const ASIENTO: Record<string, string> = {
  conductor: "al volante",
  copiloto: "de copiloto",
  trasero_izquierdo: "atrás a la izquierda",
  trasero_centro: "atrás al centro",
  trasero_derecho: "atrás a la derecha",
  tercera_fila: "en la tercera fila",
  otro: "en otro asiento",
};

const OBJETO: Record<string, string> = {
  arbol: "el árbol",
  poste: "el poste",
  muro: "el muro",
  barda: "la barda",
  vehiculo_estacionado: "el vehículo estacionado",
  puesto: "el puesto",
  contenedor: "el contenedor",
  senal: "la señal",
  parada_autobus: "la parada de autobús",
  otro: "un objeto",
};

const fmt = fmtNumber;

/** Hacia dónde se mueve el ocupante respecto al habitáculo, en palabras. */
export function directionWords(deg: number): string {
  const a = ((deg % 360) + 360) % 360;
  if (a < 22.5 || a >= 337.5) return "hacia adelante";
  if (a < 67.5) return "hacia adelante y a la izquierda";
  if (a < 112.5) return "hacia la izquierda";
  if (a < 157.5) return "hacia atrás y a la izquierda";
  if (a < 202.5) return "hacia atrás";
  if (a < 247.5) return "hacia atrás y a la derecha";
  if (a < 292.5) return "hacia la derecha";
  return "hacia adelante y a la derecha";
}

function actorName(resultado: Resultado, id: string, tipo: string): string {
  if (tipo === "vehiculo") {
    const v = resultado.vehiculos.find((x) => x.id === id);
    return v ? `el vehículo ${v.rol}` : id;
  }
  if (tipo === "persona") {
    const p = resultado.personas.find((x) => x.id === id);
    return p ? (ROL[p.rol] ?? p.rol).toLowerCase().replace(/^persona /, "la persona ") : id;
  }
  const o = resultado.objetos?.find((x) => x.id === id);
  return o ? (OBJETO[o.tipo] ?? o.tipo) : id;
}

/** Explica una causa de no visibilidad (`objeto:<id>`, `vehiculo:<id>`, `noche`, `clima`). */
export function causeWords(resultado: Resultado, cause: string): string {
  if (cause === "noche") return "la oscuridad (fuera del alcance de los faros)";
  if (cause === "clima") return "la lluvia o la niebla (visibilidad declarada)";
  const [kind, id] = cause.split(":");
  if (kind === "objeto" && id) return actorName(resultado, id, "objeto");
  if (kind === "vehiculo" && id) return actorName(resultado, id, "vehiculo");
  return cause;
}

/**
 * Personas (proyección y ocupantes) y visibilidad. Lenguaje neutro: describe movimientos y
 * líneas de vista, nunca lesiones ni responsabilidades (PLAN §10).
 */
export function PeoplePanel({
  resultado,
  people,
}: {
  resultado: Resultado;
  people?: PeopleAttachment | null;
}) {
  const ragdoll = new Map((people?.ragdolls ?? []).map((r) => [r.personId, r]));
  const vis = resultado.visibilidad ?? [];
  return (
    <section className="flex flex-col gap-4 text-sm" aria-label="Personas y visibilidad">
      <div>
        <h3 className="font-semibold">Personas</h3>
        <ul className="mt-1 flex flex-col gap-2" data-testid="personas">
          {resultado.personas.map((p) => {
            const veh = p.vehiculo_id
              ? resultado.vehiculos.find((v) => v.id === p.vehiculo_id)
              : undefined;
            const r = ragdoll.get(p.id);
            return (
              <li key={p.id}>
                <span className="font-medium">{ROL[p.rol] ?? p.rol}</span>
                {veh ? ` del vehículo ${veh.rol}` : ""}
                {p.proyeccion ? (
                  <span className="block">
                    Proyección (Searle): {fmt(p.proyeccion.distancia_m, 1)} m a{" "}
                    {fmt(p.proyeccion.velocidad_lanzamiento_kmh)} km/h; banda posible{" "}
                    {fmt(p.proyeccion.banda_searle_m[0], 1)}–
                    {fmt(p.proyeccion.banda_searle_m[1], 1)} m.
                    {r
                      ? ` Ragdoll del visor: ${fmt(r.distance, 1)} m, ${r.inBand ? "dentro" : "fuera"} de la banda.`
                      : ""}
                  </span>
                ) : null}
                {p.ocupante ? (
                  <span className="block">
                    Sentado {ASIENTO[p.ocupante.asiento] ?? p.ocupante.asiento}
                    {p.ocupante.cinturon_declarado === undefined
                      ? "; el relato no dice si llevaba cinturón (se muestran ambos casos)"
                      : p.ocupante.cinturon_declarado
                        ? ", con cinturón"
                        : ", sin cinturón"}
                    . En el impacto se mueve {directionWords(p.ocupante.pulso.direccion_deg)}:
                    {p.ocupante.variantes.map((v) => (
                      <span key={String(v.cinturon)} className="block pl-3">
                        {v.cinturon ? "Con cinturón" : "Sin cinturón"}: hasta{" "}
                        {fmt(100 * v.desplazamiento_max_m)} cm
                        {v.contacto
                          ? `; alcanza ${v.contacto.zona} a los ${fmt(1000 * v.contacto.t_s)} ms`
                          : ""}
                        .
                      </span>
                    ))}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
          Cinemática ilustrativa del cuerpo y del interior del vehículo. Croquis no estima lesiones;
          los aros azules solo marcan zonas de contacto probables.
        </p>
      </div>
      {vis.length > 0 ? (
        <div>
          <h3 className="font-semibold">Visibilidad</h3>
          <ul className="mt-1 flex flex-col gap-1" data-testid="visibilidad">
            {vis.map((v) => {
              const s = v.resumen;
              const who = `Desde el vehículo ${resultado.vehiculos.find((x) => x.id === v.observador)?.rol ?? v.observador}`;
              const what = actorName(resultado, v.objetivo, v.tipo_objetivo);
              let text: string;
              if (!s.visible_al_impacto) {
                text = `${what} no se veía al momento del impacto${
                  s.oclusor_principal
                    ? ` (lo tapaba ${causeWords(resultado, s.oclusor_principal)})`
                    : ""
                }.`;
              } else if (s.visible_toda_la_aproximacion) {
                text = `${what} se veía durante toda la aproximación mostrada (desde ${fmt(s.distancia_al_verse_m ?? 0)} m).`;
              } else {
                text = `${what} se veía desde ${fmt(-(s.visible_desde_s ?? 0), 1)} s antes del impacto, a ${fmt(
                  s.distancia_al_verse_m ?? 0,
                  1,
                )} m${s.oclusor_principal ? `; antes lo tapaba ${causeWords(resultado, s.oclusor_principal)}` : ""}.`;
              }
              return (
                <li key={`${v.observador}-${v.objetivo}`}>
                  <span className="font-medium">{who}:</span> {text}
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Línea de vista desde el ojo del conductor (altura AASHTO) con los objetos y vehículos de
            la escena. En la cámara del conductor se dibuja: verde si se veía, naranja si algo lo
            tapaba.
          </p>
        </div>
      ) : null}
    </section>
  );
}
