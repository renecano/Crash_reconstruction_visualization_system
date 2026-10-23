"use client";
/**
 * La lista de «Reproducción de reportes» (R9, ADR 0073): un renglón compacto por reporte con la
 * modalidad que concluyó CESVI (etiqueta de R0 y título del reporte), la de Croquis y si coinciden,
 * las zonas de contacto y el primer impacto. Se filtra por modalidad y por si coincide; se muestran
 * de 40 en 40.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { RUTAS } from "@/lib/casos";

export interface RenglonReproduccion {
  id: string;
  nombre: string;
  /** La modalidad que concluyó CESVI según R0 y según el título del reporte (null si no la da). */
  cesvi: string | null;
  titulo: string | null;
  croquis: string | null;
  coincide: boolean | null;
  zonas: string;
  primero: boolean | null;
}

const PAGINA = 40;

function Marca({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-texto-3">—</span>;
  return ok ? (
    <span className="font-semibold text-texto">coincide</span>
  ) : (
    <span className="text-senal-texto">no coincide</span>
  );
}

export function ListaReproduccion({
  renglones,
  modalidades,
}: {
  renglones: RenglonReproduccion[];
  /** El nombre de cada modalidad del contrato. */
  modalidades: Record<string, string>;
}) {
  const [modalidad, setModalidad] = useState("");
  const [estado, setEstado] = useState<"" | "coincide" | "no_coincide">("");
  const [cuantos, setCuantos] = useState(PAGINA);
  const nombre = (m: string | null) => (m ? (modalidades[m] ?? m) : "—");
  const opciones = useMemo(
    () => [...new Set(renglones.flatMap((r) => (r.cesvi ? [r.cesvi] : [])))].sort(),
    [renglones],
  );
  const filtrados = renglones.filter(
    (r) =>
      (!modalidad || r.cesvi === modalidad) &&
      (!estado || (estado === "coincide" ? r.coincide === true : r.coincide === false)),
  );
  return (
    <section className="flex flex-col gap-4" data-testid="casos-r4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="t-nota flex flex-col gap-1">
          Modalidad que concluyó CESVI
          <select
            className="campo h-10"
            value={modalidad}
            onChange={(e) => {
              setModalidad(e.target.value);
              setCuantos(PAGINA);
            }}
            data-testid="filtro-modalidad"
          >
            <option value="">Todas</option>
            {opciones.map((m) => (
              <option key={m} value={m}>
                {nombre(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="t-nota flex flex-col gap-1">
          Croquis
          <select
            className="campo h-10"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value as typeof estado);
              setCuantos(PAGINA);
            }}
            data-testid="filtro-coincide"
          >
            <option value="">Coincida o no</option>
            <option value="coincide">Coincide</option>
            <option value="no_coincide">No coincide</option>
          </select>
        </label>
        <p className="t-nota text-texto-3" role="status" data-testid="cuantos-casos">
          {filtrados.length} de {renglones.length} reportes
        </p>
      </div>
      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-texto-3">
              <th className="px-4 py-3 font-medium">Reporte</th>
              <th className="px-4 py-3 font-medium">Modalidad de CESVI</th>
              <th className="px-4 py-3 font-medium">Título del reporte</th>
              <th className="px-4 py-3 font-medium">Croquis</th>
              <th className="px-4 py-3 font-medium">Zonas de contacto</th>
              <th className="px-4 py-3 font-medium">Primer impacto</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.slice(0, cuantos).map((r) => (
              <tr key={r.id} className="border-t border-linea-suave" data-caso={r.id}>
                <td className="px-4 py-2.5">
                  <Link
                    className="font-medium whitespace-nowrap underline underline-offset-2 hover:text-texto-2"
                    href={RUTAS.reporte(r.id)}
                  >
                    {r.nombre}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{nombre(r.cesvi)}</td>
                <td className="px-4 py-2.5 text-texto-2">{nombre(r.titulo)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {r.croquis ? nombre(r.croquis) : "sin inferir"} · <Marca ok={r.coincide} />
                </td>
                <td className="cifras px-4 py-2.5 text-texto-2">{r.zonas}</td>
                <td className="px-4 py-2.5">
                  <Marca ok={r.primero} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtrados.length > cuantos ? (
        <button
          type="button"
          className="boton-secundario self-center"
          onClick={() => setCuantos((c) => c + PAGINA)}
          data-testid="ver-mas-casos"
        >
          Ver {Math.min(PAGINA, filtrados.length - cuantos)} más
        </button>
      ) : null}
    </section>
  );
}
