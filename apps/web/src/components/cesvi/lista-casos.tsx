"use client";
/**
 * `/cesvi`: la lista de casos (ADR 0079; rediseño «Laboratorio», prompt §8). Tres acciones (narrar,
 * cargar un reporte y abrir un `.croquis`), el último caso reproducido como hoja de expediente y el
 * índice de reportes con filtros de conteo real. Un archivo se puede soltar en toda la página. Todo
 * caso se abre en el mismo recorrido.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dejarArchivo } from "@/lib/archivo-pendiente";
import { nombreCaso, RUTAS } from "@/lib/casos";
import { filtrar, filtrosDeReportes, lineaDeEstado, miniCroquis } from "@/lib/casos-lab";
import { borrarDeEsteEquipo, useCasosGuardados } from "@/lib/casos-navegador";
import { Linea, Sube } from "./movimiento";

export interface EjemploReporte {
  id: string;
  /** El nombre en la fila; si no, `Reporte <id>`. */
  titulo?: string;
  /** Lo que va debajo del nombre («AXA · A2010930»). */
  clave?: string;
  href?: string;
  modalidad: string;
  vehiculos: number;
  estado: string;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

/** El esquema del tipo de choque, generado (no lleva posiciones del caso ni va a escala). */
function MiniCroquis({
  modalidad,
  vehiculos,
  grande = false,
}: {
  modalidad: string;
  vehiculos: number;
  grande?: boolean;
}) {
  const c = miniCroquis(modalidad, vehiculos);
  return (
    <svg
      viewBox="0 0 120 72"
      className={grande ? "w-full" : "h-[72px] w-[120px]"}
      role="img"
      aria-label={`Esquema de ${modalidad.toLowerCase()}, ${vehiculos} ${vehiculos === 1 ? "vehículo" : "vehículos"}`}
      data-testid="mini-croquis"
    >
      <rect width={120} height={72} rx={grande ? 6 : 10} fill="var(--superficie-alta)" />
      <rect y={23} width={120} height={26} fill="var(--superficie)" />
      {c.cruce ? <rect x={47} width={26} height={72} fill="var(--superficie)" /> : null}
      <line
        x1={0}
        y1={36}
        x2={120}
        y2={36}
        stroke="var(--texto-3)"
        strokeWidth={0.6}
        strokeDasharray="4 4"
      />
      {c.piezas.map((p, k) =>
        p.tipo === "objeto" ? (
          <rect
            key={k}
            x={p.x - 3}
            y={p.y - 8}
            width={6}
            height={16}
            rx={1}
            fill="var(--texto-2)"
          />
        ) : (
          <rect
            key={k}
            x={p.x - 10}
            y={p.y - 5}
            width={20}
            height={10}
            rx={2.5}
            transform={`rotate(${p.rumbo} ${p.x} ${p.y})`}
            fill={p.tipo === "golpea" ? "var(--texto)" : "var(--superficie)"}
            stroke="var(--texto)"
            strokeWidth={0.8}
          />
        ),
      )}
      <circle
        cx={c.impacto.x}
        cy={c.impacto.y}
        r={3}
        fill="none"
        stroke="var(--senal)"
        strokeWidth={1.2}
      />
      <circle cx={c.impacto.x} cy={c.impacto.y} r={1} fill="var(--senal)" />
    </svg>
  );
}

export function ListaCasos({
  axa,
  reportes,
}: {
  /** El caso de AXA: su título, sus cifras y su estado salen del propio caso. */
  axa: {
    clave: string;
    titulo: string;
    modalidad: string;
    vehiculos: number;
    /** La diferencia con CESVI: las dos cifras, en km/h y en %. */
    croquisKmh: string | null;
    cesviKmh: string | null;
    difPct: string | null;
    zonas: string;
  };
  reportes: EjemploReporte[];
}) {
  // Los guardados viven en el navegador: el servidor no los ve.
  const guardados = useCasosGuardados();
  const router = useRouter();
  const [filtro, setFiltro] = useState("todos");
  const [soltando, setSoltando] = useState(false);
  const filtros = filtrosDeReportes(reportes);
  const visibles = filtrar(reportes, filtro);

  /** «Abrir archivo» siempre abre un caso, aunque el archivo se haya renombrado. */
  const abrirCaso = (f: File | undefined) => {
    if (!f) return;
    dejarArchivo(f, "caso");
    router.push(RUTAS.nuevo);
  };

  // Soltar un archivo en cualquier parte de la página (prompt §8).
  useEffect(() => {
    const conArchivo = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const encima = (e: DragEvent) => {
      if (!conArchivo(e)) return;
      e.preventDefault();
      setSoltando(true);
    };
    const fuera = (e: DragEvent) => {
      if (e.relatedTarget === null) setSoltando(false);
    };
    const suelta = (e: DragEvent) => {
      if (!conArchivo(e)) return;
      e.preventDefault();
      setSoltando(false);
      const f = e.dataTransfer?.files[0];
      if (f) router.push(dejarArchivo(f) === "caso" ? RUTAS.nuevo : RUTAS.importar);
    };
    window.addEventListener("dragover", encima);
    window.addEventListener("dragleave", fuera);
    window.addEventListener("drop", suelta);
    return () => {
      window.removeEventListener("dragover", encima);
      window.removeEventListener("dragleave", fuera);
      window.removeEventListener("drop", suelta);
    };
  }, [router]);

  return (
    <main data-testid="lista-casos">
      {soltando ? (
        <div
          className="pointer-events-none fixed inset-4 z-50 grid place-items-center rounded-panel border-2 border-dashed border-texto bg-[color-mix(in_srgb,var(--fondo)_85%,transparent)]"
          data-testid="soltar-archivo"
        >
          <span className="text-[1.4rem] font-semibold">
            Suelta el reporte de CESVI o el archivo .croquis
          </span>
        </div>
      ) : null}
      <section className="mx-auto grid max-w-[1344px] items-center gap-10 px-4 py-12 md:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
        <div className="flex min-w-0 flex-col gap-5">
          <h1 className="font-[family-name:var(--fuente-titulo)] text-[clamp(4.5rem,9vw,7.5rem)] leading-none font-normal tracking-[-0.03em]">
            <Linea>Casos</Linea>
          </h1>
          <p className="text-[1.05rem] text-texto-2" data-testid="estado-casos">
            {lineaDeEstado(reportes.length, guardados === null ? null : guardados.length)}
          </p>
          <Sube
            i={1}
            className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,5fr)_minmax(0,3.2fr)_minmax(0,3fr)]"
          >
            <Link
              href={RUTAS.nuevo}
              className="flex min-h-44 flex-col justify-end gap-1 rounded-[20px] bg-[var(--texto)] p-6 text-[var(--fondo)] transition-transform hover:-translate-y-0.5"
              data-testid="ir-caso-nuevo"
            >
              <span className="text-[1.2rem] font-semibold">Narrar un hecho nuevo</span>
              <span className="text-[0.8125rem] opacity-75">Escríbelo con tus palabras</span>
            </Link>
            <Link
              href={RUTAS.importar}
              className="flex min-h-44 flex-col justify-end gap-1 rounded-[20px] border border-dashed border-texto-3 bg-superficie p-6 transition-colors hover:border-texto"
              data-testid="ir-importar"
            >
              <span className="text-[1.2rem] leading-tight font-semibold">
                Cargar un reporte de CESVI
              </span>
              <span className="t-nota">Suéltalo aquí · PDF, Markdown o texto</span>
            </Link>
            <label
              className="flex min-h-44 cursor-pointer flex-col justify-end gap-1 rounded-[20px] border border-linea-suave bg-superficie p-6 transition-colors focus-within:border-texto hover:border-texto"
              data-testid="abrir-archivo-casos"
            >
              <span className="text-[1.2rem] font-semibold">Abrir archivo</span>
              <span className="t-nota">.croquis</span>
              <input
                type="file"
                accept=".croquis,.json,application/json"
                className="sr-only"
                onChange={(e) => abrirCaso(e.target.files?.[0])}
                data-testid="abrir-caso-casos"
              />
            </label>
          </Sube>
        </div>
        <Link
          href={RUTAS.axa}
          className="hoja-expediente relative block"
          aria-label={`Abrir ${axa.titulo}`}
          data-testid="ir-axa"
        >
          <span className="hoja-expediente-fondo" aria-hidden="true" />
          <article className="escena-hoja relative flex flex-col gap-3 p-6">
            <header className="flex items-baseline justify-between gap-3">
              <span className="t-nota">Caso reproducido</span>
              <span className="font-mono text-[0.6875rem] text-texto-3">{axa.clave}</span>
            </header>
            <MiniCroquis modalidad={axa.modalidad} vehiculos={axa.vehiculos} grande />
            <p className="text-[1.15rem] font-semibold" data-testid="titulo-ultimo">
              {axa.titulo}
            </p>
            <div className="flex flex-wrap gap-8">
              {axa.difPct ? (
                <div className="flex flex-col gap-0.5">
                  <span
                    className="cifra-protagonista text-[3.25rem] leading-none"
                    data-testid="ultimo-pct"
                  >
                    {axa.difPct}
                  </span>
                  <span className="t-nota" data-testid="ultimo-cifras">
                    con CESVI: {axa.croquisKmh} contra {axa.cesviKmh} km/h
                  </span>
                </div>
              ) : null}
              <div className="flex flex-col gap-0.5">
                <span className="cifra-protagonista text-[3.25rem] leading-none">{axa.zonas}</span>
                <span className="t-nota">zonas de contacto</span>
              </div>
            </div>
          </article>
        </Link>
      </section>

      {guardados?.length ? (
        <section
          className="mx-auto flex max-w-[1344px] flex-col gap-3 px-4 pb-10 md:px-12"
          aria-label="Tus casos"
        >
          <h2 className="font-[family-name:var(--fuente-titulo)] text-[2.25rem] leading-none font-normal">
            Tus casos en este equipo
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="casos-guardados">
            {guardados.map((g) => (
              <li key={g.id} className="tarjeta flex items-start justify-between gap-3 p-5">
                <Link
                  href={RUTAS.guardado(g.id)}
                  className="flex flex-col gap-1"
                  data-testid={`guardado-${g.id}`}
                >
                  <span className="t-interfaz font-semibold">{g.titulo}</span>
                  <span className="t-nota">
                    {fecha(g.guardado)} · {g.vehiculos} vehículo{g.vehiculos === 1 ? "" : "s"}
                    {g.validado ? " · validado" : " · sin validar"}
                    {g.conReporte ? " · con reporte de CESVI" : ""}
                  </span>
                </Link>
                <button
                  type="button"
                  className="boton-secundario boton-compacto shrink-0"
                  onClick={() => borrarDeEsteEquipo(g.id)}
                  aria-label={`Borrar ${g.titulo} de este equipo`}
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-t border-linea-suave bg-superficie" aria-label="Reportes de CESVI">
        <div className="mx-auto flex max-w-[1344px] flex-col gap-5 px-4 py-10 md:px-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-[family-name:var(--fuente-titulo)] text-[2.75rem] leading-none font-normal tracking-[-0.02em]">
              Reportes de CESVI
            </h2>
            <div
              className="flex flex-wrap gap-5"
              role="group"
              aria-label="Filtrar por modalidad"
              data-testid="filtros-reportes"
            >
              {filtros.map((f) => (
                <button
                  key={f.clave}
                  type="button"
                  aria-pressed={filtro === f.clave}
                  onClick={() => setFiltro(f.clave)}
                  className={`border-b-2 pb-1 text-[0.9375rem] ${filtro === f.clave ? "border-texto font-semibold" : "border-transparent text-texto-2 hover:text-texto"}`}
                  data-testid={`filtro-${f.clave}`}
                >
                  {f.nombre} {f.n}
                </button>
              ))}
            </div>
          </header>
          <ul
            className="flex flex-col divide-y divide-[var(--linea-suave)] border-y border-linea-suave"
            data-testid="indice-reportes"
          >
            {visibles.map((r) => (
              <li key={r.id}>
                <Link
                  href={r.href ?? RUTAS.reporte(r.id)}
                  className="fila-reporte grid items-center gap-x-6 gap-y-1 py-3 transition-colors hover:bg-superficie-alta md:grid-cols-[120px_minmax(0,1fr)_170px_110px_240px_24px]"
                  data-testid={`ir-reporte-${r.id}`}
                >
                  <span className="mini-crece block">
                    <MiniCroquis modalidad={r.modalidad} vehiculos={r.vehiculos} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[1.05rem] font-semibold">
                      {r.titulo ?? nombreCaso(r.id)}
                    </span>
                    {r.clave ? (
                      <span className="font-mono text-[0.75rem] text-texto-3">{r.clave}</span>
                    ) : null}
                  </span>
                  <span className="text-texto-2">{r.modalidad}</span>
                  <span className="text-texto-2">
                    {r.vehiculos} {r.vehiculos === 1 ? "vehículo" : "vehículos"}
                  </span>
                  <span className="font-medium">{r.estado}</span>
                  <span className="flecha-avanza" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={RUTAS.reproduccion}
            className="t-interfaz self-start underline underline-offset-2"
            data-testid="ir-reproduccion"
          >
            Ver los 205 reportes de la reproducción y cuánto acierta Croquis
          </Link>
        </div>
      </section>
    </main>
  );
}
