/**
 * Diagnóstico de AXA A2010930 (comentario de René, 2026-10-24): la reconstrucción del solver daba V2
 * a 41.01 km/h y el reporte de CESVI dice 63.15 km/h. ¿Es de método, de datos o un error?
 *
 * 1. **Entradas:** lo que usa CESVI en el reporte contra lo que recibe el solver, con cada diferencia
 *    y su origen.
 * 2. **Sensibilidad:** la velocidad previa de V2 que estima la inversión al mover cada entrada dentro
 *    de su rango (fricción, posiciones finales, ángulo de impacto, PDOF, masas).
 * 3. **Métodos:** qué es cada número (63.15, 60.27 y el del solver) y una comprobación física con
 *    momento y energía.
 * 4. **Arranques:** el ajuste desde la velocidad por omisión y desde una compatible con la
 *    deformación (V2 a la velocidad de cierre mínima, V1 detenido), para ver si el resultado es un
 *    mínimo local o un conflicto entre evidencias.
 *
 * «antes» es el resultado con el código anterior al arreglo (`eval/results/axa_diagnostico_antes.json`,
 * corrido en 8ab9271); el resto, con el código actual (ADR 0091).
 *
 * La escena es la del caso de ejemplo de /cesvi (la lectura grabada del reporte) con las posiciones
 * de la versión de la evidencia sobre MEX 15D, como `tools/demo/escena-axa.mts`, armada aquí sin
 * tocar `demo/escenas-r11`.
 *
 *   cd packages/cesvi && pnpm exec tsx ../../eval/cesvi_axa_diagnostico.mts [salida.json]
 *     → eval/results/axa_diagnostico.json
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyValues,
  evidenceFromSpec,
  fitEvidence,
  invert,
} from "../packages/solver-ts/src/inversion.ts";
import { checkDamageReach } from "../packages/solver-ts/src/consistency.ts";
import { crushEnergy } from "../packages/solver-ts/src/crash3.ts";
import { stiffnessFor } from "../packages/solver-ts/src/stiffness.ts";
import { reconstruct } from "../packages/solver-ts/src/reconstruct.ts";
import {
  avanzar,
  callesCerca,
  caso,
  especDeExpediente,
  importarDictamen,
  mcHenry,
  proponerVersiones,
  reconstruccionContraCesvi,
  reconstruirExpediente,
  reproducir,
  tramoDelCaso,
  ubicacionIlustrativa,
  type Expediente,
  type SalidaCorpus,
  type SalidaNarracion,
} from "../packages/cesvi/src/index.ts";

type Json = Record<string, unknown>;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = process.argv[2] ?? join(RAIZ, "eval/results/axa_diagnostico.json");
const leer = (ruta: string) => JSON.parse(readFileSync(join(RAIZ, ruta), "utf8")) as unknown;
const G = 9.8; // la del reporte
const KMH = 3.6;
const r2 = (x: number) => Math.round(x * 100) / 100;

// --- La escena de AXA, como la arma la app -------------------------------------------------------
const c = caso("A2010930");
const lecturas = leer("data/cesvi/grabaciones/importar/lecturas-a2010930.json") as {
  corpus: SalidaCorpus;
  narracion: SalidaNarracion;
};
const ejemplo = leer("data/cesvi/grabaciones/importar/ejemplo.json") as {
  texto: string;
  archivo: string;
};
const leido = importarDictamen(ejemplo.texto, lecturas.corpus, lecturas.narracion, ejemplo.archivo);
const u = ubicacionIlustrativa(c.id)!;
const via = callesCerca(tramoDelCaso(c.id), [u.lon, u.lat], 150).cercana!;

interface Variante {
  /** Distancia del reposo de A (V1) al impacto, en la vía (m). */
  reposoA?: number;
  /** Dónde reposa B (V2): detrás de A tocándolo (método de los restos), en el impacto, o sin dato. */
  reposoB?: "detras" | "impacto" | "ninguno";
  /** Giro del rumbo de B en el impacto respecto de la vía (grados). */
  anguloB?: number;
}

function expediente(v: Variante = {}): Expediente {
  const ev = proponerVersiones({
    impacto: [u.lon, u.lat],
    rumboVia: via.rumbo,
    medidas: { A: { largo: 5.34, ancho: 1.86 }, B: { largo: 5.34, ancho: 1.86 } },
    distanciaRestos: v.reposoA ?? c.evidencia.restos.distancia_m.valor,
    reversaM: 3,
  }).evidencia;
  const ID = { A: "V1", B: "V2" } as const;
  const finalB =
    (v.reposoB ?? "detras") === "detras"
      ? { punto: avanzar(ev.vehiculos.A.final.punto, via.rumbo, -5.34), rumbo: via.rumbo }
      : v.reposoB === "impacto"
        ? ev.vehiculos.B.final
        : null;
  const posiciones = (["A", "B"] as const).flatMap((l) =>
    (["impacto", "final"] as const).flatMap((fase) => {
      const p = l === "B" && fase === "final" ? finalB : ev.vehiculos[l][fase];
      if (!p) return [];
      const rumbo = l === "B" && fase === "impacto" ? p.rumbo + (v.anguloB ?? 0) : p.rumbo;
      return [
        {
          vehiculo: ID[l],
          fase,
          punto: { lon: p.punto[0], lat: p.punto[1] },
          rumbo: ((rumbo % 360) + 360) % 360,
          fuente: "perito" as const,
        },
      ];
    }),
  );
  const e = leido.expediente;
  return {
    ...e,
    caso: {
      ...e.caso,
      lugar: { ...e.caso.lugar, coordenadas: { lat: u.lat, lon: u.lon } },
    },
    versiones: [{ tipo: "evidencia", posiciones }],
  };
}

/** La escena del solver y el id de V2 en ella. */
function escena(v: Variante = {}): { spec: Json; v2: string; v1: string } {
  const base = especDeExpediente(expediente(v), "axa-diagnostico");
  const id = (x: string) => Object.entries(base.ids).find(([, e]) => e === x)![0];
  return { spec: base.spec as Json, v2: id("V2"), v1: id("V1") };
}

/** La velocidad previa de V2 que estima la inversión (km/h), o null si la evidencia no la fija. */
function v2De(
  spec: Json,
  v2: string,
  v1?: string,
): {
  mejor: number | null;
  v1: number | null;
  evidencia: string[];
  residuos: { nombre: string; sigma: number }[];
} {
  const inv = invert(spec, { samples: 4 }).toDict() as {
    evidencia: string[];
    parametros: {
      parametro: string;
      vehiculo: string;
      identificable: boolean;
      estimacion?: { mejor: number };
    }[];
    residuos?: { nombre: string; sigma: number }[];
  };
  const vel = (id?: string) => {
    const p = inv.parametros.find((x) => x.parametro === "velocidad_previa" && x.vehiculo === id);
    return p?.identificable && p.estimacion ? r2(p.estimacion.mejor) : null;
  };
  return { mejor: vel(v2), v1: vel(v1), evidencia: inv.evidencia, residuos: inv.residuos ?? [] };
}

const cambiar = (spec: Json, f: (s: Json) => void): Json => {
  const s = structuredClone(spec);
  f(s);
  return s;
};
const vehiculo = (s: Json, id: string) => (s.vehiculos as Json[]).find((v) => v.id === id) as Json;

// --- 1. Entradas ---------------------------------------------------------------------------------
const base = escena();
const sb = base.spec;
const dB = c.calculos.deformacion_B;
const danosV2 = ((sb.danos_declarados ?? []) as Json[]).filter((d) => d.vehiculo_id === base.v2);
const perfilV2 = danosV2[0]?.perfil_aplastamiento as Json | undefined;
const perfilIgual =
  danosV2.length === 1 &&
  JSON.stringify(perfilV2?.valor) === JSON.stringify(dB.C_m.map((x) => x.valor)) &&
  (danosV2[0]!.ancho_danado as Json).valor === dB.L_m.valor;
const rigV2 = danosV2[0]?.rigidez as Json | undefined;
// La inversión de la escena base y su reconstrucción con las velocidades ajustadas.
const base2 = v2De(sb, base.v2, base.v1);
const recAjuste =
  base2.mejor !== null && base2.v1 !== null
    ? reconstruct(
        applyValues(
          sb,
          new Map([
            [`velocidad:${base.v2}`, base2.mejor],
            [`velocidad:${base.v1}`, base2.v1],
          ]),
        ),
      ).vehiculos.find((v) => v.id === base.v2)!
    : null;
const r0 = reconstruct(sb);
const recV1 = r0.vehiculos.find((v) => v.id === base.v1)!;
const params = r0.parametros as Record<string, { valor: number; fuente?: string; tipo?: string }>;
const entradas = [
  {
    entrada: "Masa de V2 (Tacoma)",
    cesvi: `${c.vehiculos.B.masa_kg!.valor} kg («${c.vehiculos.B.masa_kg!.cita}»)`,
    solver: `${String((vehiculo(sb, base.v2).masa as Json | undefined)?.valor ?? "típica de su clase")} kg`,
    difiere: false,
    origen: "La lectura del reporte.",
  },
  {
    entrada: "Masa de V1 (Silverado)",
    cesvi: "El reporte no la da.",
    solver: `${r2(recV1.mass)} kg, la típica de su clase (pickup), supuesto`,
    difiere: true,
    origen: "Dato que falta en el reporte; el solver usa la típica de la clase.",
  },
  {
    entrada: "Daños de V2 con medidas",
    cesvi: "Una deformación medida: el frente (la del McHenry)",
    solver: `${danosV2.length} (${danosV2.map((d) => String((d.zona as Json).lado)).join(", ")})`,
    difiere: danosV2.length !== 1,
    origen:
      danosV2.length !== 1
        ? "Error: la lectura repite las medidas del frente en otro daño."
        : "Se usa solo la de la cara del impacto (arreglado, ADR 0091).",
  },
  {
    entrada: "Perfil de deformación de V2",
    cesvi: `C1–C4 = ${dB.C_m.map((x) => x.valor).join(", ")} m, L = ${dB.L_m.valor} m (frontal)`,
    solver: danosV2
      .map(
        (d) =>
          `${String((d.zona as Json).lado)}: profundidad ${String((d.profundidad_aplastamiento as Json).valor)} m, ancho ${String((d.ancho_danado as Json).valor)} m${d.perfil_aplastamiento ? `, perfil ${JSON.stringify((d.perfil_aplastamiento as Json).valor)}` : ""}`,
      )
      .join("; "),
    difiere: !perfilIgual,
    origen: perfilIgual
      ? "El perfil C1–C4 del reporte (arreglado: antes llegaba solo la profundidad máxima, pareja en todo el ancho)."
      : "Error: llega solo la profundidad máxima, como deformación pareja en todo el ancho.",
  },
  {
    entrada: "Rigidez A y B de V2",
    cesvi: `A = ${dB.A.valor}, B = ${dB.B.valor} (impresas como N/m; son kN/m y kN/m², ADR 0048)`,
    solver: rigV2
      ? `A = ${String(rigV2.a)} N/m, B = ${String(rigV2.b)} N/m² (la del reporte)`
      : "Coeficientes de la clase pickup, frente, de las pruebas de NHTSA (E2), muestreados",
    difiere: !rigV2,
    origen: rigV2
      ? "La del reporte (arreglado: antes, la de la clase de NHTSA, que con el mismo perfil da 2.6 veces la energía)."
      : "Error: la rigidez del reporte no llega al solver.",
  },
  {
    entrada: "Energía de deformación de V2",
    cesvi: `${dB.reporte.energia.valor} (kJ; impresa como «Julios»)`,
    solver: recAjuste
      ? `${r2(recAjuste.crushEnergyJ / 1000)} kJ en la reconstrucción con las velocidades que ajusta la inversión`
      : "La inversión no fija las velocidades",
    difiere: true,
    origen:
      "Sale de la reconstrucción, no se mide: depende de las velocidades que ajusta la inversión.",
  },
  {
    entrada: "Fricción después del impacto",
    cesvi: `a = ${c.calculos.desplazamiento.a.valor} («${c.calculos.desplazamiento.a.cita}»)`,
    solver: `llanta ${params.friccion_llanta?.valor ?? "?"} (${params.friccion_llanta?.fuente ?? ""}); arrastre después del impacto ${params.arrastre_post_impacto?.valor ?? "?"} (${params.arrastre_post_impacto?.tipo ?? ""})`,
    difiere: true,
    origen:
      "De método: CESVI supone deslizamiento con 0.9; el solver, llantas que ruedan con arrastre.",
  },
  {
    entrada: "Distancia después del impacto",
    cesvi: `D = ${c.calculos.desplazamiento.D_m.valor} m, la separación de los restos, como recorrido de V1`,
    solver: `reposo de V1 a ${c.evidencia.restos.distancia_m.valor} m del impacto en la vía (posición de la versión de la evidencia)`,
    difiere: false,
    origen: "La misma medida del reporte.",
  },
  {
    entrada: "Reposo de V2",
    cesvi: "El reporte no lo da.",
    solver: "Detrás de V1, tocándolo (el supuesto del método de los restos: avanzan juntos)",
    difiere: true,
    origen: "Dato que falta en el reporte; supuesto.",
  },
  {
    entrada: "Posiciones y ángulo de impacto",
    cesvi: "Alcance colineal (el reporte no da posiciones)",
    solver: `Colineal sobre MEX 15D, rumbo ${r2(via.rumbo)}° (versión de la evidencia)`,
    difiere: false,
    origen: "Supuesto de la versión de la evidencia, igual al del reporte.",
  },
];

// --- Errores encontrados --------------------------------------------------------------------------
const lados = danosV2.map((d) => String((d.zona as Json).lado));
const errores = [
  ...(lados.length > 1
    ? [
        {
          error: "Medidas de deformación duplicadas",
          detalle: `V2 recibe las mismas C y L en ${lados.length} daños (${lados.join(", ")}); el reporte las mide en el frente (la cara del impacto). La lectura grabada las puso también en el costado derecho.`,
        },
      ]
    : []),
  ...(danosV2.some((d) => !d.perfil_aplastamiento)
    ? [
        {
          error: "Perfil de deformación incompleto",
          detalle:
            "Al solver llega solo la profundidad máxima (0.96 m) como deformación pareja en todo el ancho; el reporte mide un perfil C1–C4 que baja a 0.20 m. Pareja, la energía sale mucho mayor.",
        },
      ]
    : []),
];

// --- 2. Sensibilidad ------------------------------------------------------------------------------
if (!base2.evidencia.some((e) => e.startsWith("dano")))
  errores.push({
    error: "La deformación no entra a la inversión",
    detalle:
      "La inversión usa el daño solo si los dos vehículos tienen deformación medida; el reporte mide solo la de V2, así que la evidencia que ajusta es solo el reposo y el rumbo final, y la velocidad de cierre queda libre.",
  });
const sens: { entrada: string; valor: string; v2_kmh: number | null; v1_kmh: number | null }[] = [];
const medir = (entrada: string, valor: string, spec: Json, v2: string) => {
  const v1 = (spec.vehiculos as Json[]).map((v) => String(v.id)).find((id) => id !== v2);
  const r = v2De(spec, v2, v1);
  sens.push({ entrada, valor, v2_kmh: r.mejor, v1_kmh: r.v1 });
  console.log(entrada, valor, "→", r.mejor, r.v1);
};
for (const mu of [0.55, 0.7, 0.8, 0.9])
  medir(
    "Fricción de la llanta",
    String(mu),
    cambiar(sb, (s) => {
      (s.lugar as Json).friccion = { valor: mu, fuente: "usuario", confianza: 0.9 };
    }),
    base.v2,
  );
for (const d of [12.89, 15.89, 18.89]) {
  const e = escena({ reposoA: d });
  medir("Reposo de V1 desde el impacto (m)", String(d), e.spec, e.v2);
}
for (const rb of ["detras", "impacto", "ninguno"] as const) {
  const e = escena({ reposoB: rb });
  medir("Reposo de V2", rb, e.spec, e.v2);
}
for (const a of [-10, 0, 10]) {
  const e = escena({ anguloB: a });
  medir("Ángulo de V2 en el impacto (°)", String(a), e.spec, e.v2);
}
for (const h of [11, 12, 1])
  medir(
    "PDOF de V2 (horas)",
    String(h),
    cambiar(sb, (s) => {
      for (const z of ((s.eventos as Json[])[0]!.zonas_impacto ?? []) as Json[])
        if (z.vehiculo_id === base.v2)
          z.pdof_horas = { valor: h, fuente: "usuario", confianza: 0.9 };
    }),
    base.v2,
  );
medir(
  "Ruedas después del impacto",
  "bloqueadas en los dos (deslizan, como supone CESVI)",
  cambiar(sb, (s) => {
    for (const v of s.vehiculos as Json[])
      v.frenado = { aplico: { valor: true, fuente: "usuario", confianza: 0.9 } };
  }),
  base.v2,
);
for (const m of [2000, 2600, 3200])
  medir(
    "Masa de V1 (kg)",
    String(m),
    cambiar(sb, (s) => {
      vehiculo(s, base.v1).masa = { valor: m, unidad: "kg", fuente: "usuario", confianza: 0.9 };
    }),
    base.v2,
  );
for (const f of [0.9, 1, 1.1]) {
  const m = r2(c.vehiculos.B.masa_kg!.valor * f);
  medir(
    "Masa de V2 (kg)",
    String(m),
    cambiar(sb, (s) => {
      vehiculo(s, base.v2).masa = { valor: m, unidad: "kg", fuente: "usuario", confianza: 0.9 };
    }),
    base.v2,
  );
}

// --- 3. Métodos y comprobación física --------------------------------------------------------------
const mB = c.vehiculos.B.masa_kg!.valor;
const eB = mcHenry({
  L: dB.L_m.valor,
  A: dB.A.valor,
  B: dB.B.valor,
  C: dB.C_m.map((x) => x.valor),
}).energia; // kJ con los coeficientes impresos
const ebs = Math.sqrt((2 * eB * 1000) / mB) * KMH;
const filas = reproducir(c).filas;
const mA = recV1.mass;
const kClase = stiffnessFor("pickup", "frontal");
const eClase =
  crushEnergy(
    dB.C_m.map((x) => x.valor),
    dB.L_m.valor,
    kClase.stiffness,
  ) / 1000;
const muRed = (mA * mB) / (mA + mB);
// Toda la energía de V2 en un choque plástico de dos cuerpos: velocidad de cierre mínima (si V1 no
// se deformara nada). Con la masa supuesta de V1: es una cota, no una conclusión.
const cierreMin = Math.sqrt((2 * eB * 1000) / muRed) * KMH;
const vRestos =
  Math.sqrt(2 * c.calculos.desplazamiento.a.valor * G * c.calculos.desplazamiento.D_m.valor) * KMH;
const metodos = {
  cesvi_deformacion: {
    valor_kmh: dB.reporte.ebs_kmh.valor,
    metodo:
      "Velocidad equivalente de barrera (EBS) de V2: la velocidad a la que toda la energía de su deformación (McHenry con C1–C4, L, A y B) se absorbería contra una barrera rígida, v = √(2E/m), con la masa de V2. Es una equivalencia de energía, no la velocidad a la que circulaba.",
    croquis_con_los_mismos_datos_kmh: r2(
      filas.find((f) => f.clave === "ebs_kmh_datos")!.croquis as number,
    ),
    croquis_recalculado_kmh: r2(ebs),
  },
  cesvi_restos: {
    valor_kmh: c.calculos.desplazamiento.reporte.v_kmh.valor,
    metodo:
      "Velocidad de V1 al salir del impacto, para recorrer la separación de los restos (15.89 m) deslizando con a = 0.9: v = √(2·a·g·D). Es de V1 después del impacto, no de V2 antes.",
    croquis_recalculado_kmh: r2(vRestos),
  },
  solver: {
    valor_kmh: base2.mejor,
    metodo:
      "Velocidad de V2 justo antes del impacto que hace que la simulación (impulso con conservación de momento y la trayectoria después del impacto con las llantas del solver) termine donde quedaron los vehículos. Es la velocidad a la que circulaba.",
    evidencia_que_usa: base2.evidencia,
  },
  comprobacion_fisica: {
    masa_v1_supuesta_kg: r2(mA),
    energia_v2_kj: r2(eB),
    velocidad_cierre_minima_kmh: r2(cierreMin),
    // El mismo perfil con la rigidez de la clase (NHTSA E2, frente de pickup, mediana): la que usaba
    // el solver antes del arreglo.
    energia_v2_rigidez_clase_kj: r2(eClase),
    razon_clase_contra_reporte: r2(eClase / eB),
    solver_v1_kmh: base2.v1,
    solver_cierre_kmh:
      base2.mejor !== null && base2.v1 !== null ? r2(base2.mejor - base2.v1) : null,
    residuo_dano_minimo_sigma:
      base2.residuos.find((r) => r.nombre.startsWith("dano_minimo"))?.sigma ?? null,
    lectura:
      "En un alcance entre dos vehículos, la energía de deformación sale de la velocidad de cierre con la masa reducida (½·μ·v²), no con la masa de V2 sola: con la deformación de V2 la velocidad de cierre es al menos este valor (más si V1 también se deformó). Un cierre cercano a cero no es compatible con 0.96 m de deformación.",
  },
};
// --- 4. Arranques ---------------------------------------------------------------------------------
const semilla = Number((sb.meta as Json).semilla);
const evBase = evidenceFromSpec(sb, semilla);
const ajuste = (nombre: string, start: Map<string, number> | null) => {
  const f = fitEvidence(sb, evBase, { start });
  return {
    arranque: nombre,
    v2_kmh: r2(f.values.get(`velocidad:${base.v2}`)!),
    v1_kmh: r2(f.values.get(`velocidad:${base.v1}`)!),
    costo: r2(f.cost),
    residuos_sigma: Object.fromEntries([...f.residuals].map(([k, x]) => [k, r2(x)])),
  };
};
const arranques = [
  ajuste("por omisión (40 km/h los dos)", null),
  ajuste(
    `compatible con la deformación (V2 a ${r2(cierreMin)} km/h, V1 detenido)`,
    new Map([
      [`velocidad:${base.v2}`, cierreMin],
      [`velocidad:${base.v1}`, 0],
    ]),
  ),
];
const inversionBase = invert(sb);
const bandera = checkDamageReach(sb, inversionBase, semilla);
for (const a of arranques) console.log("arranque", a.arranque, "→", a.v2_kmh, a.v1_kmh, a.costo);

// --- 5. Lo que ve el perito en el paso 6, el 3D y el dictamen (la reconstrucción completa de la app).
const paso6 = reconstruccionContraCesvi(expediente(), reconstruirExpediente(expediente(), "axa"));
for (const f of paso6.filas)
  console.log("paso 6", f.metodo, f.cesviKmh, f.croquisKmh, f.diferenciaKmh, f.diferenciaPct);

const antes = leer("eval/results/axa_diagnostico_antes.json") as {
  git_commit: string;
  errores: { error: string; detalle: string }[];
  sensibilidad: { v2_base_kmh: number | null };
};
const pct = (x: number, ref: number) => r2(((x - ref) / ref) * 100);
const ebsCesvi = dB.reporte.ebs_kmh.valor;
const restosCesvi = c.calculos.desplazamiento.reporte.v_kmh.valor;
const conclusion = {
  antes: {
    git_commit: antes.git_commit,
    v2_kmh: antes.sensibilidad.v2_base_kmh,
    errores: antes.errores.map((e) => e.error),
  },
  despues: {
    v2_kmh: base2.mejor,
    errores_pendientes: errores.map((e) => e.error),
  },
  diferencia_con_deformacion:
    base2.mejor === null
      ? null
      : { kmh: r2(base2.mejor - ebsCesvi), pct: pct(base2.mejor, ebsCesvi) },
  diferencia_con_restos:
    base2.mejor === null
      ? null
      : { kmh: r2(base2.mejor - restosCesvi), pct: pct(base2.mejor, restosCesvi) },
  error: errores.map((e) => e.error),
  metodo:
    "El 63.15 de CESVI es una equivalencia de energía de V2 contra una barrera; el 60.27 es V1 después del impacto con deslizamiento a 0.9; el del solver es la velocidad previa de V2 por momento y trayectorias. Son tres magnitudes distintas: aun sin errores, no tienen por qué coincidir.",
  datos:
    "Faltan en el reporte la masa de V1 y el reposo de V2 (supuesto: detrás de V1, tocándolo); la fricción después del impacto se supone distinta (CESVI: deslizan juntos con a = 0.9; el solver: llantas que ruedan con arrastre de 0.35·μ).",
  consistencia:
    "Con la deformación del reporte, la velocidad de cierre debe ser al menos la de «comprobacion_fisica». Si la reconstrucción queda por debajo (residuo negativo de «dano_minimo»), la deformación y las posiciones finales supuestas no son compatibles con el modelo del solver: es un conflicto de datos y supuestos que el perito debe ver, no un número que se ajuste.",
  arranques:
    "Si el ajuste desde el arranque compatible con la deformación tiene más costo que el de por omisión, el resultado no es un mínimo local: con el modelo del solver (restitución y llantas que ruedan después del impacto), una velocidad de cierre que alcanza la deformación separa a los vehículos y deja a V2 lejos del reposo supuesto (tocando a V1). El supuesto que pesa es ese reposo, que el reporte no da.",
  bandera_dano_no_alcanzado: bandera.map((b) => b.mensaje),
};

const doc = {
  name: "axa_diagnostico",
  generated_at: new Date().toISOString().slice(0, 19) + "Z",
  git_commit: execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim(),
  descripcion:
    "AXA A2010930: por qué la reconstrucción del solver da una velocidad de V2 distinta del 63.15 km/h del reporte de CESVI. Entradas, sensibilidad de V2 y métodos.",
  escena:
    "El caso de ejemplo de /cesvi (lectura grabada del reporte) con la versión de la evidencia sobre MEX 15D y V2 en reposo detrás de V1; inversión del port TS (4 muestras).",
  entradas,
  errores,
  sensibilidad: { v2_base_kmh: base2.mejor, filas: sens },
  metodos,
  arranques,
  paso6,
  conclusion,
};
writeFileSync(SALIDA, `${JSON.stringify(doc, null, 2)}\n`);
console.log(
  "escrito",
  SALIDA,
  "| V2 base:",
  base2.mejor,
  "| V1:",
  base2.v1,
  "| errores:",
  errores.map((e) => e.error),
  "| dano_minimo σ:",
  metodos.comprobacion_fisica.residuo_dano_minimo_sigma,
);
