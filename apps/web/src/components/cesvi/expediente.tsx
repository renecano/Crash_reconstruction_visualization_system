/**
 * El expediente del caso: datos del siniestro, vehículos, declaración literal y evidencia, como los
 * registra el dictamen (sin placas, VIN ni nombres: docs/cesvi/PROTOTIPO.md).
 */
import type { CasoCesvi, Vehiculo } from "@croquis/cesvi";

const FECHA = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "UTC" });
const fecha = (iso: string) => FECHA.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="t-nota text-texto-2">{etiqueta}</dt>
      <dd className="t-interfaz">{children}</dd>
    </>
  );
}

function FichaVehiculo({ letra, v }: { letra: "A" | "B"; v: Vehiculo }) {
  return (
    <section aria-labelledby={`vehiculo-${letra}`} className="flex flex-col gap-3">
      <h3 id={`vehiculo-${letra}`} className="t-subtitulo">
        Vehículo {letra}: {v.marca} {v.tipo} {v.modelo}
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        <Dato etiqueta="Color">{v.color}</Dato>
        <Dato etiqueta="Placas">{v.placas}</Dato>
        <Dato etiqueta="Servicio">{v.servicio}</Dato>
        {v.masa_kg ? (
          <Dato etiqueta="Masa (cálculo)">
            <span className="cifras">{v.masa_kg.valor.toLocaleString("es-MX")} kg</span>
          </Dato>
        ) : null}
      </dl>
      <ul className="flex flex-col gap-2">
        {v.danos.map((d) => (
          <li key={d.cita} className="t-cuerpo">
            <span className="t-nota text-texto-2">
              {d.zona}
              {d.acento ? `, acentuación a la ${d.acento}` : ""}:
            </span>{" "}
            {d.descripcion}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Expediente({ caso }: { caso: CasoCesvi }) {
  const l = caso.lugar;
  return (
    <section aria-labelledby="expediente" className="flex flex-col gap-8">
      <h2 id="expediente" className="t-titulo">
        Expediente
      </h2>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-[auto_1fr]">
        <Dato etiqueta="Modalidad dictaminada">{caso.modalidad_dictaminada}</Dato>
        <Dato etiqueta="Fecha y hora">
          {fecha(caso.fecha_hora.valor)}, {caso.fecha_hora.aproximada ? "~" : ""}
          {caso.fecha_hora.valor.slice(11)} h
        </Dato>
        <Dato etiqueta="Reporte de CESVI emitido">
          {fecha(caso.fecha_dictamen.valor)}, por un {caso.autor_dictamen}
        </Dato>
        <Dato etiqueta="Aseguradora">{caso.aseguradora}</Dato>
        <Dato etiqueta="Objetivo">{caso.objetivo.valor}</Dato>
        <Dato etiqueta="Lugar">{l.descripcion}</Dato>
        <Dato etiqueta="Vía">
          {l.arroyos.length} arroyos (
          {l.arroyos.map((a) => `${a.sentido} hacia ${a.hacia}`).join("; ")}), cada uno de{" "}
          <span className="cifras">{l.ancho_arroyo_m.valor} m</span>. {l.separacion.valor}{" "}
          {l.carpeta.valor}
        </Dato>
      </dl>

      <div className="grid gap-8 md:grid-cols-2">
        <FichaVehiculo letra="A" v={caso.vehiculos.A} />
        <FichaVehiculo letra="B" v={caso.vehiculos.B} />
      </div>

      <section aria-labelledby="declaracion" className="flex flex-col gap-2">
        <h3 id="declaracion" className="t-subtitulo">
          Declaración del conductor de {caso.declaracion.conductor} (literal)
        </h3>
        <blockquote className="t-cuerpo border-l-2 border-evidencia pl-4" lang="es-MX">
          «{caso.declaracion.texto}»
        </blockquote>
      </section>

      <section aria-labelledby="evidencia" className="flex flex-col gap-2">
        <h3 id="evidencia" className="t-subtitulo">
          Evidencia en el lugar
        </h3>
        <p className="t-cuerpo">
          {caso.evidencia.restos.descripcion} Entre el primero y el último hay{" "}
          <span className="cifras">{caso.evidencia.restos.distancia_m.valor} m</span>.
        </p>
      </section>
    </section>
  );
}
