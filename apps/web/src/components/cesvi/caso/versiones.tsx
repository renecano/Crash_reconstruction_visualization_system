"use client";
/**
 * El acto «Versiones» (ronda 4, punto 8; René, 2026-11-18: la propuesta 1 con la entrada de la 2).
 * Entre Reconstrucción y Análisis: el escenario grande con la versión elegida como fantasma y, aquí
 * en la hoja, la lista de versiones (lo que declaró cada conductor y las hipótesis «¿y si…?» del
 * perito) con lo que cambia en su lenguaje: velocidad, dónde se tocan y la trayectoria. Croquis no
 * dice quién tiene razón ni juzga a ningún conductor.
 */
import {
  cambiosDeHipotesis,
  REGLA_SUGERENCIA_DECLARADA,
  resultadoDeHipotesis,
  resumenHipotesis,
  sugerirDeclarada,
  tituloHipotesis,
  type Expediente,
  type FilaDeclarada,
  type Reconstruccion,
} from "@croquis/cesvi";
import type { Resultado } from "@croquis/scene-schema";
import { FormDeclaracion } from "@/components/cesvi/comparacion-declaracion";
import { claveHipotesis, type VersionCaso, type VersionDeclaracion } from "@/lib/versiones-caso";
import { ProbarConductores, ResultadoConductores } from "./conductores";

type Id = Expediente["vehiculos"][number]["id"];

const ESTADO: Record<FilaDeclarada["estado"], { texto: string; clase: string }> = {
  no_coincide: { texto: "No coincide", clase: "insignia insignia-senal" },
  coincide: { texto: "Coincide", clase: "insignia" },
  sin_dato: { texto: "Sin dato", clase: "insignia insignia-supuesto" },
};
const ORDEN = { no_coincide: 0, coincide: 1, sin_dato: 2 } as const;
const TIPO: Record<VersionCaso["tipo"], string> = {
  declaracion: "Declaración del conductor",
  hipotesis: "Hipótesis del perito",
};

/** Una tarjeta de «Qué cambia»: el concepto, las dos lecturas y si coinciden. */
function Tarjeta({
  concepto,
  filas,
  estado,
  fila,
}: {
  concepto: string;
  filas: [string, string][];
  estado: { texto: string; clase: string };
  fila?: string;
}) {
  return (
    <li className="hundido flex flex-col gap-1.5 rounded-control p-3" data-fila={fila}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[0.8125rem] font-semibold">{concepto}</span>
        <span className={`${estado.clase} shrink-0`}>{estado.texto}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[0.8125rem]">
        {filas.map(([dt, dd]) => (
          <div key={dt} className="contents">
            <dt className="text-texto-3">{dt}</dt>
            <dd className="cifras">{dd}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

/** Lo que cambia con una declaración: primero lo que no coincide, con los vehículos por su nombre. */
function CambiosDeclaracion({
  v,
  nombreDe,
  onSugerencia,
}: {
  v: VersionDeclaracion;
  nombreDe: (id: string) => string;
  onSugerencia: (s: VersionDeclaracion["sugerencia"]) => void;
}) {
  const orden = [...v.filas].sort(
    (a, b) =>
      ORDEN[a.estado] - ORDEN[b.estado] ||
      Number(b.vehiculo === v.declarante) - Number(a.vehiculo === v.declarante),
  );
  const s = sugerirDeclarada(v.filas);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2" data-testid="que-cambia">
        {orden.map((f) => (
          <Tarjeta
            key={`${f.clave}-${f.vehiculo}`}
            fila={`${f.clave}-${f.vehiculo}`}
            concepto={`${f.concepto} · ${nombreDe(f.vehiculo)}`}
            filas={[
              ["Declaró", f.declarada],
              ["La evidencia", f.evidencia],
            ]}
            estado={ESTADO[f.estado]}
          />
        ))}
      </ul>
      <details className="t-nota">
        <summary className="cursor-pointer">Lo que dice la declaración, con sus citas</summary>
        <ul className="mt-2 flex flex-col gap-1" data-testid="lo-que-declara">
          {v.version.maniobras.map((m) => (
            <li key={`m-${m.vehiculo}`}>
              {nombreDe(m.vehiculo)}: {m.tipo.replaceAll("_", " ")} — «{m.cita}»
            </li>
          ))}
          {v.version.velocidades.map((x) => (
            <li key={`v-${x.vehiculo}`}>
              {nombreDe(x.vehiculo)}: <span className="cifras">{x.kmh} km/h</span> — «{x.cita}»
            </li>
          ))}
          {v.version.contactos.map((c) => (
            <li key={`c-${c.impacto}-${c.vehiculo}`}>
              {nombreDe(c.vehiculo)}: contacto {c.cara.replaceAll("_", " ")} — «{c.cita}»
            </li>
          ))}
        </ul>
      </details>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={v.sugerencia.pedida}
          onChange={(e) => onSugerencia({ pedida: e.target.checked, decision: null })}
          data-testid="pedir-sugerencia"
        />
        <span className="t-interfaz">Mostrar la sugerencia de Croquis</span>
      </label>
      {v.sugerencia.pedida ? (
        <div className="hundido flex flex-col gap-2 p-4" data-testid="sugerencia-declarada">
          <p className="t-interfaz">{s.texto}</p>
          <p className="t-nota">{REGLA_SUGERENCIA_DECLARADA}</p>
          <div className="flex flex-wrap gap-2">
            {(["confirmada", "descartada"] as const).map((d) => (
              <button
                key={d}
                type="button"
                className="boton-secundario"
                aria-pressed={v.sugerencia.decision === d}
                onClick={() => onSugerencia({ pedida: true, decision: d })}
              >
                {d === "confirmada" ? "Confirmar" : "Descartar"}
              </button>
            ))}
          </div>
          {v.sugerencia.decision ? (
            <p role="status" className="t-nota" data-testid="decision-sugerencia">
              El perito {v.sugerencia.decision === "confirmada" ? "confirmó" : "descartó"} la
              sugerencia.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ActoVersiones({
  expediente,
  r,
  versiones,
  elegida,
  onElegir,
  onVersion,
  onQuitar,
  nombreDe,
  en3d,
  version3d,
  onVersion3d,
  textoInicial,
  declaranteInicial,
}: {
  expediente: Expediente;
  r: Reconstruccion | null;
  versiones: readonly VersionCaso[];
  /** La versión que se dibuja como fantasma (null: solo la reconstrucción). */
  elegida: string | null;
  onElegir: (clave: string | null) => void;
  /** Una versión nueva o cambiada (la sugerencia de una declaración). */
  onVersion: (v: VersionCaso) => void;
  onQuitar: (clave: string) => void;
  nombreDe: (id: string) => string;
  /** El escenario está en 3D: ahí se alterna entre la reconstrucción y la versión. */
  en3d: boolean;
  /** En el 3D se ve la versión elegida (si no, la reconstrucción). */
  version3d: boolean;
  onVersion3d: (x: boolean) => void;
  textoInicial?: string;
  declaranteInicial?: Id;
}) {
  const v = versiones.find((x) => x.clave === elegida) ?? null;
  const vacio = versiones.length === 0;
  return (
    <div className="flex flex-col gap-6" data-testid="acto-versiones">
      <div className="flex flex-col gap-2">
        <h2 className="t-subtitulo">Versiones</h2>
        <p className="t-nota">
          Lo que declaró cada conductor y lo que el perito quiere probar, simulado con la misma
          física y dibujado sobre la reconstrucción. Croquis no dice quién tiene razón.
        </p>
      </div>
      {!r ? (
        <p className="t-nota">
          Reconstruye primero: las versiones se comparan contra la reconstrucción.
        </p>
      ) : vacio ? (
        <p className="t-interfaz" data-testid="versiones-vacio">
          Todavía no hay versiones. Agrega lo que declaró un conductor o prueba una hipótesis «¿y
          si…?».
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="lista-versiones" aria-label="Versiones">
          <li>
            <button
              type="button"
              aria-pressed={elegida === null}
              onClick={() => onElegir(null)}
              className={`flex w-full flex-col gap-0.5 rounded-control border p-3 text-left ${elegida === null ? "border-texto bg-superficie" : "border-linea-suave"}`}
              data-testid="version-ninguna"
            >
              <span className="text-[0.9375rem] font-semibold">Solo la reconstrucción</span>
              <span className="t-nota">Sin fantasma</span>
            </button>
          </li>
          {versiones.map((x) => (
            <li key={x.clave} className="relative">
              <button
                type="button"
                aria-pressed={elegida === x.clave}
                onClick={() => onElegir(x.clave)}
                className={`flex w-full flex-col gap-0.5 rounded-control border p-3 pr-12 text-left ${elegida === x.clave ? "border-texto bg-superficie" : "border-linea-suave"}`}
                data-testid={`version-${x.clave}`}
                data-tipo={x.tipo}
              >
                <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-texto-3 uppercase">
                  {TIPO[x.tipo]}
                </span>
                <span className="text-[0.9375rem] font-semibold">{x.titulo}</span>
                <span className="t-nota">{x.resumen}</span>
              </button>
              <button
                type="button"
                className="boton-compacto boton-secundario solo-trabajar absolute top-2 right-2"
                aria-label={`Quitar: ${x.titulo}`}
                onClick={() => onQuitar(x.clave)}
                data-testid={`quitar-${x.clave}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {v ? (
        <section className="flex flex-col gap-3" data-testid="version-elegida">
          <h3 className="t-interfaz font-semibold">Qué cambia</h3>
          {en3d ? (
            <div className="segmentado self-start" role="group" aria-label="Qué se ve en el 3D">
              <button
                type="button"
                aria-pressed={!version3d}
                onClick={() => onVersion3d(false)}
                className="px-4"
                data-testid="ver-3d-reconstruccion"
              >
                La reconstrucción
              </button>
              <button
                type="button"
                aria-pressed={version3d}
                onClick={() => onVersion3d(true)}
                className="px-4"
                data-testid="ver-3d-version"
              >
                Esta versión
              </button>
            </div>
          ) : null}
          <p className="t-nota">
            {en3d
              ? "En el 3D se alterna entre las dos con la misma cámara y el mismo instante."
              : "En el 2D, la versión va punteada sobre la reconstrucción."}
          </p>
          {v.tipo === "declaracion" ? (
            <CambiosDeclaracion
              v={v}
              nombreDe={nombreDe}
              onSugerencia={(sugerencia) => onVersion({ ...v, sugerencia })}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {v.prueba.lineaBaseDistinta ? (
                <p
                  className="t-nota border-l-2 border-senal pl-3 text-senal-texto"
                  data-testid="aviso-linea-base"
                >
                  Sin la hipótesis, los conductores dan {v.prueba.lineaBaseDistinta.sinHipotesis};
                  la reconstrucción tiene {v.prueba.lineaBaseDistinta.reconstruccion}. La simulación
                  de los conductores no impone el impacto de la reconstrucción: compara con «Sin
                  ella».
                </p>
              ) : null}
              <ul className="flex flex-col gap-2" data-testid="que-cambia">
                {v.cambios.map((c) => (
                  <Tarjeta
                    key={`${c.clave}-${c.concepto}`}
                    fila={c.clave}
                    concepto={c.concepto}
                    filas={[
                      ["Con la hipótesis", c.version],
                      ["Sin ella", c.reconstruccion],
                    ]}
                    estado={
                      c.cambia
                        ? { texto: "Cambia", clase: "insignia insignia-senal" }
                        : { texto: "Igual", clase: "insignia" }
                    }
                  />
                ))}
              </ul>
              <p className="t-nota">
                «Sin ella» son los mismos conductores sin la hipótesis. La simulación llega hasta el
                primer contacto: no calcula el choque ni el daño. Es una prueba ilustrativa de la
                física con esa decisión, no un juicio sobre ningún conductor.
              </p>
              <details className="t-nota">
                <summary className="cursor-pointer">Ver el detalle de la simulación</summary>
                <div className="mt-2">
                  <ResultadoConductores p={v.prueba} />
                </div>
              </details>
            </div>
          )}
        </section>
      ) : null}

      {r ? (
        <div className="solo-trabajar flex flex-col gap-3">
          <details className="hundido rounded-control p-4" open={vacio}>
            <summary
              className="t-interfaz cursor-pointer font-semibold"
              data-testid="abrir-declaracion"
            >
              Agregar lo que declaró un conductor
            </summary>
            <div className="mt-3">
              <FormDeclaracion
                expediente={expediente}
                reconstruccion={r}
                nombreDe={nombreDe}
                textoInicial={textoInicial}
                declaranteInicial={declaranteInicial}
                onVersion={(x) => {
                  onVersion(x);
                  onElegir(x.clave);
                }}
              />
            </div>
          </details>
          <details className="hundido rounded-control p-4" open={vacio}>
            <summary
              className="t-interfaz cursor-pointer font-semibold"
              data-testid="abrir-hipotesis"
            >
              Probar una hipótesis «¿y si…?»
            </summary>
            <div className="mt-3">
              <ProbarConductores
                r={r}
                nombreDe={nombreDe}
                onProbada={({ h, p, agentes }) => {
                  const resultado = resultadoDeHipotesis(r, agentes);
                  if (!resultado) return;
                  const clave = claveHipotesis(versiones);
                  const titulo = tituloHipotesis(h, nombreDe);
                  onVersion({
                    clave,
                    tipo: "hipotesis",
                    titulo,
                    resumen: resumenHipotesis(p),
                    etiqueta: "la hipótesis «¿y si…?» del perito",
                    resultado: resultado as unknown as Resultado,
                    h,
                    prueba: p,
                    cambios: cambiosDeHipotesis(p, agentes, h, nombreDe, r),
                    agentes,
                  });
                  onElegir(clave);
                }}
              />
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
