import type { EscenaSpec } from "@croquis/scene-schema";

/** Un campo del contrato tal como llega: valor, de dónde salió y la cita que lo respalda. */
interface Campo {
  valor?: unknown;
  unidad?: string;
  fuente?: string;
  evidencia?: { texto: string }[];
}

const LABELS: Record<string, string> = {
  impacto_vehiculo_vehiculo: "choque entre vehículos",
  impacto_vehiculo_objeto: "choque contra un objeto",
  impacto_vehiculo_persona: "golpe a una persona",
  volcadura: "volcadura",
  derrape: "salida del camino",
  inicio_frenado: "frenón",
  arrastre: "arrastre",
  sedan_compacto: "auto compacto",
  sedan_mediano: "auto mediano",
  hatchback: "hatchback",
  suv_compacta: "camioneta SUV compacta",
  suv_grande: "camioneta SUV grande",
  pickup: "pickup",
  van: "van",
  microbus_combi: "combi o microbús",
  autobus: "autobús",
  camion_unitario: "camión de carga",
  tractocamion: "tráiler",
  motocicleta: "motocicleta",
  bicicleta: "bicicleta",
  scooter: "scooter",
  recto: "seguía recto",
  vuelta_izquierda: "vuelta a la izquierda",
  vuelta_derecha: "vuelta a la derecha",
  vuelta_u: "vuelta en U",
  cambio_carril_izquierda: "cambio de carril a la izquierda",
  cambio_carril_derecha: "cambio de carril a la derecha",
  reversa: "en reversa",
  incorporacion: "incorporándose",
  detenido: "detenido",
  estacionado: "estacionado",
  recta: "tramo recto",
  curva: "curva",
  interseccion_x: "cruce en X",
  interseccion_t: "cruce en T",
  glorieta: "glorieta",
  retorno: "retorno",
  estacionamiento: "estacionamiento",
  carretera_dos_carriles: "carretera",
  autopista: "autopista",
  seco: "seco",
  mojado: "mojado",
  encharcado: "encharcado",
  grava_suelta: "grava suelta",
  despejado: "despejado",
  nublado: "nublado",
  lluvia_ligera: "lluvia ligera",
  lluvia_fuerte: "lluvia fuerte",
  niebla: "niebla",
  dia: "de día",
  amanecer: "amanecer",
  atardecer: "atardecer",
  noche_con_alumbrado: "noche con alumbrado",
  noche_sin_alumbrado: "noche sin alumbrado",
  conductor: "conductor",
  pasajero: "pasajero",
  peaton: "peatón",
  ciclista: "ciclista",
  motociclista: "motociclista",
};

const FUENTE: Record<string, { label: string; className: string }> = {
  relato: {
    label: "del relato",
    className: "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100",
  },
  usuario: {
    label: "tu respuesta",
    className: "bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100",
  },
  supuesto: {
    label: "supuesto",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  },
  default: {
    label: "por omisión",
    className: "bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
  },
};

function label(v: unknown): string {
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return String(Math.round(v * 10) / 10);
  const s = String(v ?? "—");
  return LABELS[s] ?? s.replaceAll("_", " ");
}

function Fila({ nombre, campo }: { nombre: string; campo: Campo | undefined }) {
  if (!campo || campo.valor === undefined) return null;
  const f = FUENTE[campo.fuente ?? "default"] ?? FUENTE.default!;
  const cita = campo.evidencia?.[0]?.texto;
  return (
    <div className="flex flex-wrap items-baseline gap-2 py-1">
      <dt className="w-40 shrink-0 text-sm text-neutral-600 dark:text-neutral-400">{nombre}</dt>
      <dd className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">
          {label(campo.valor)}
          {campo.unidad ? ` ${campo.unidad}` : ""}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-xs ${f.className}`}>{f.label}</span>
        {cita ? (
          <q className="text-sm text-neutral-600 italic dark:text-neutral-400">{cita}</q>
        ) : null}
      </dd>
    </div>
  );
}

/** Lo que se entendió del relato, con la fuente de cada dato y su cita literal. */
export function FactsPanel({ spec }: { spec: EscenaSpec }) {
  const s = spec as unknown as {
    lugar: Record<string, Campo>;
    entorno: Record<string, Campo>;
    eventos: { tipo: string; procedencia?: Campo }[];
    vehiculos: {
      id: string;
      rol: string;
      clase: Campo;
      maniobra: Campo;
      velocidad_previa?: Campo;
      frenado?: { aplico?: Campo };
      color?: { nombre?: Campo };
    }[];
    personas: { id: string; rol: Campo; vehiculo_id?: string }[];
  };
  const evento = s.eventos[0];
  return (
    <section aria-label="Lo que se entendió" data-testid="hechos" className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Lo que se entendió</h2>
      <dl>
        {evento ? (
          <Fila nombre="Qué pasó" campo={{ valor: evento.tipo, ...evento.procedencia }} />
        ) : null}
        <Fila nombre="Tipo de vía" campo={s.lugar.tipo_via} />
        <Fila nombre="Piso" campo={s.lugar.estado_superficie} />
        <Fila nombre="Clima" campo={s.entorno.clima} />
        <Fila nombre="Luz" campo={s.entorno.iluminacion} />
      </dl>
      {s.vehiculos.map((v) => (
        <div key={v.id} data-testid={`hechos-${v.id}`}>
          <h3 className="font-medium">Vehículo {v.rol}</h3>
          <dl>
            <Fila nombre="Tipo" campo={v.clase} />
            <Fila nombre="Color" campo={v.color?.nombre} />
            <Fila nombre="Maniobra" campo={v.maniobra} />
            <Fila nombre="Velocidad" campo={v.velocidad_previa} />
            <Fila nombre="¿Frenó?" campo={v.frenado?.aplico} />
          </dl>
        </div>
      ))}
      {s.personas.length > 0 ? (
        <div>
          <h3 className="font-medium">Personas</h3>
          <dl>
            {s.personas.map((p) => (
              <Fila
                key={p.id}
                nombre={
                  p.vehiculo_id ? `En ${p.vehiculo_id.replace("veh-", "").toUpperCase()}` : "A pie"
                }
                campo={p.rol}
              />
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
