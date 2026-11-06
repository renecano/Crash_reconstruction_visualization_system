"use client";
/**
 * La hoja de papel del dictamen (rediseño «Laboratorio», prompt §8): se actualiza mientras el perito
 * escribe. Sin firma lleva la marca de agua «Borrador»; al firmar cae el sello «Validado» con la
 * huella de las entradas, se quita la marca y la firma aparece en itálica. Es una vista previa: el
 * archivo que se descarga lleva todas las secciones.
 */
import type { Reconstruccion } from "@croquis/cesvi";
import type { OverpassResponse } from "@croquis/croquis-2d";
import { Logotipo } from "@/components/sitio/logo";
import { filasDeLaHoja, narracionCorta, SECCIONES_DICTAMEN } from "@/lib/dictamen-lab";
import type { CifraContraste } from "@/lib/contraste-lab";
import { MaquetaCaso } from "../escena/maqueta-caso";

export function HojaDictamen({
  titulo,
  casoId,
  lugar,
  narracion,
  r,
  calles,
  contra,
  letraDe,
  conclusion,
  perito,
  firma,
  formato,
}: {
  titulo: string;
  casoId: string | null;
  lugar: string;
  narracion: string | null;
  r: Reconstruccion;
  calles: OverpassResponse | null;
  contra: CifraContraste | null;
  letraDe: (id: string) => string;
  conclusion: string;
  perito: string;
  /** La validación vigente: con ella la hoja queda firmada. */
  firma: { perito: string; fecha: string; huella: string } | null;
  formato: keyof typeof SECCIONES_DICTAMEN;
}) {
  const filas = filasDeLaHoja(r, letraDe, contra);
  const fecha = firma
    ? new Date(firma.fecha).toLocaleDateString("es-MX", { dateStyle: "long" })
    : "[fecha de emisión]";
  return (
    <article
      className="hoja-papel relative flex w-full max-w-[640px] flex-col gap-4 overflow-hidden p-10 md:p-14"
      aria-label="Vista previa del dictamen"
      data-testid="hoja-dictamen"
      data-firmada={firma ? "si" : "no"}
    >
      {firma ? (
        <div
          className="sello-validado absolute right-10 bottom-32 flex rotate-[-8deg] flex-col items-center gap-0.5 rounded-md border-2 border-[var(--senal)] px-4 py-2 text-[var(--senal)]"
          data-testid="sello-validado"
        >
          <span className="text-[1.1rem] font-bold tracking-[0.2em]">VALIDADO</span>
          <span className="font-mono text-[0.625rem]">SHA-256 {firma.huella}</span>
        </div>
      ) : (
        // Un dibujo, no un texto: es una marca de agua y no se lee como parte del dictamen.
        <svg
          className="pointer-events-none absolute inset-x-0 top-1/4 h-40 w-full select-none"
          viewBox="0 0 600 160"
          aria-hidden="true"
          data-testid="marca-borrador"
        >
          <text
            x={300}
            y={110}
            textAnchor="middle"
            transform="rotate(-20 300 80)"
            fontSize={104}
            fontStyle="italic"
            fontFamily="var(--fuente-titulo)"
            fill="var(--texto)"
            opacity={0.07}
          >
            Borrador
          </text>
        </svg>
      )}
      <header className="flex items-center justify-between border-b border-[var(--texto)] pb-3">
        <Logotipo ancho={104} variante="logotipo-sobre-claro" />
        <span className="font-mono text-[0.625rem] tracking-wide text-[var(--texto-2)]">
          DICTAMEN{casoId ? ` · ${casoId}` : ""}
        </span>
      </header>
      <p
        className="font-[family-name:var(--fuente-titulo)] text-[1.9rem] leading-[1.1] tracking-[-0.02em]"
        data-testid="titulo-hoja"
      >
        Dictamen de hecho de tránsito: {titulo.charAt(0).toLowerCase() + titulo.slice(1)}
      </p>
      <p className="text-[0.75rem] text-[var(--texto-2)]">
        {lugar ? `${lugar} · ` : ""}Perito: {perito.trim() || "[nombre del perito]"} · {fecha}
      </p>
      {narracion ? (
        <section>
          <h3 className="text-[0.6875rem] font-bold tracking-[0.08em] uppercase">Narración</h3>
          <p className="text-[0.8125rem] leading-relaxed">{narracionCorta(narracion)}</p>
        </section>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="h-40 overflow-hidden rounded border border-[var(--linea)]">
          <MaquetaCaso r={r} calles={calles} nombres={{}} compacta />
        </div>
        <section>
          <h3 className="text-[0.6875rem] font-bold tracking-[0.08em] uppercase">Resultados</h3>
          <dl data-testid="resultados-hoja">
            {filas.map((f) => (
              <div
                key={f.etiqueta}
                className="flex items-baseline justify-between gap-3 border-b border-[var(--linea-suave)] py-1.5 text-[0.75rem]"
              >
                <dt>{f.etiqueta}</dt>
                <dd className="text-right font-mono">{f.valor}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <section>
        <h3 className="text-[0.6875rem] font-bold tracking-[0.08em] uppercase">
          Conclusión del perito
        </h3>
        {conclusion.trim() ? (
          <p
            className="text-[0.8125rem] leading-relaxed whitespace-pre-wrap"
            data-testid="conclusion-hoja"
          >
            {conclusion}
          </p>
        ) : (
          <p className="mt-1 rounded border border-dashed border-[var(--linea)] p-3 text-[0.75rem] text-[var(--texto-3)]">
            Aquí aparece lo que escribas a la derecha.
          </p>
        )}
      </section>
      <footer className="mt-8 flex flex-col gap-1 border-t border-[var(--texto)] pt-1.5">
        {firma ? (
          <span
            className="-mt-9 font-[family-name:var(--fuente-titulo)] text-[1.6rem] italic"
            data-testid="firma-hoja"
          >
            {firma.perito}
          </span>
        ) : null}
        <span className="text-[0.6875rem] text-[var(--texto-2)]">Firma del perito</span>
      </footer>
      <p className="text-[0.6875rem] text-[var(--texto-3)]" data-testid="secciones-hoja">
        Vista previa. El archivo lleva: {SECCIONES_DICTAMEN[formato].join(" · ")}. Reconstrucción de
        apoyo: el dictamen es del perito.
      </p>
    </article>
  );
}
