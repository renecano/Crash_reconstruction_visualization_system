"use client";
/**
 * `/cesvi`: la lista de casos (ADR 0079). Empezar un caso nuevo o cargar un reporte, los casos
 * guardados en este equipo y los de ejemplo (AXA A2010930 y los reportes de la reproducción). Todo
 * caso se abre en el mismo recorrido.
 */
import Link from "next/link";
import { nombreCaso, RUTAS } from "@/lib/casos";
import { borrarDeEsteEquipo, useCasosGuardados } from "@/lib/casos-navegador";

export interface EjemploReporte {
  id: string;
  modalidad: string;
  vehiculos: number;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

function Tarjeta({
  href,
  titulo,
  detalle,
  testid,
  principal = false,
}: {
  href: string;
  titulo: string;
  detalle: string;
  testid: string;
  principal?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`tarjeta flex flex-col gap-1.5 p-5 transition-colors hover:border-texto-3 ${principal ? "border-texto-3" : ""}`}
      data-testid={testid}
    >
      <span className="t-interfaz font-semibold">{titulo}</span>
      <span className="t-nota">{detalle}</span>
    </Link>
  );
}

export function ListaCasos({
  axa,
  reportes,
}: {
  /** El caso de AXA en una línea (aseguradora, modalidad y lugar), del propio caso. */
  axa: { titulo: string; detalle: string };
  reportes: EjemploReporte[];
}) {
  // Los guardados viven en el navegador: el servidor no los ve.
  const guardados = useCasosGuardados();
  return (
    <main className="px-4 py-10 md:px-8">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-10" data-testid="lista-casos">
        <header className="flex flex-col gap-3">
          <p className="t-rotulo">Croquis para CESVI · reconstrucción de apoyo</p>
          <h1 className="t-titulo">Casos</h1>
          <p className="t-cuerpo max-w-[70ch] text-texto-2">
            Cada caso se abre en el mismo recorrido: el hecho, el lugar, la reconstrucción con
            física y su 3D, los daños, los números, la comparación con el reporte de CESVI cuando lo
            hay y el dictamen.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2" aria-label="Empezar">
          <Tarjeta
            href={RUTAS.nuevo}
            titulo="Caso nuevo"
            detalle="Narra el hecho; Croquis lo ordena en la escena y tú colocas a los vehículos."
            testid="ir-caso-nuevo"
            principal
          />
          <Tarjeta
            href={RUTAS.importar}
            titulo="Cargar un reporte"
            detalle="Sube un reporte de CESVI en PDF, Markdown o texto y reconstrúyelo."
            testid="ir-importar"
          />
        </section>

        <section className="flex flex-col gap-3" aria-label="Tus casos">
          <h2 className="t-subtitulo">Tus casos en este equipo</h2>
          {guardados === null ? null : guardados.length ? (
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
          ) : (
            <p className="t-nota" data-testid="sin-guardados">
              Aún no guardas casos en este equipo. En el dictamen de cada caso está «Guardar en este
              equipo»; también puedes abrir un archivo de caso desde «Caso nuevo».
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-label="Casos de ejemplo">
          <h2 className="t-subtitulo">Casos de ejemplo</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Tarjeta
              href={RUTAS.axa}
              titulo={axa.titulo}
              detalle={axa.detalle}
              testid="ir-axa"
              principal
            />
            {reportes.map((r) => (
              <Tarjeta
                key={r.id}
                href={RUTAS.reporte(r.id)}
                titulo={nombreCaso(r.id)}
                detalle={`${r.modalidad} · ${r.vehiculos} vehículo${r.vehiculos === 1 ? "" : "s"} · de la reproducción de reportes`}
                testid={`ir-reporte-${r.id}`}
              />
            ))}
          </div>
          <Link
            href={RUTAS.reproduccion}
            className="t-interfaz self-start underline underline-offset-2"
            data-testid="ir-reproduccion"
          >
            Ver los 205 reportes de la reproducción y cuánto acierta Croquis
          </Link>
        </section>
      </div>
    </main>
  );
}
