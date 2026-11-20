"use client";
/**
 * La escena, propuesta 1 elegida por René (2026-11-18): la escena ya armada por Croquis y, a la
 * izquierda, la lista de lo propuesto y lo que falta, con su porqué, «Confirmar», «Corregir» o
 * «Marcar», y «Ver la reconstrucción» dentro del panel, activo al completar. Sin la barra de pasos de
 * abajo. Arriba del mapa, las herramientas con su tecla.
 */
import type { ItemEscena } from "@/lib/escena-propuesta";

const ESTADO: Record<ItemEscena["estado"], { texto: string; clase: string }> = {
  propuesto: { texto: "Propuesto", clase: "insignia insignia-supuesto" },
  confirmado: { texto: "Listo", clase: "insignia" },
  falta: { texto: "Falta", clase: "insignia insignia-senal" },
};

function Fila({
  item,
  onConfirmar,
  onAbrir,
}: {
  item: ItemEscena;
  onConfirmar: (i: ItemEscena) => void;
  onAbrir: (i: ItemEscena) => void;
}) {
  const e =
    item.estado === "falta" && item.opcional
      ? { texto: "Opcional", clase: "insignia" }
      : ESTADO[item.estado];
  return (
    <li
      className="flex flex-col gap-1.5 border-t border-linea-suave py-3 first:border-t-0"
      data-testid={`item-${item.clave}`}
      data-estado={item.estado}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[0.9375rem] font-medium">{item.texto}</span>
        <span className={`${e.clase} shrink-0`}>{e.texto}</span>
      </div>
      {item.porque ? <span className="t-nota">Por qué: {item.porque}.</span> : null}
      <div className="flex flex-wrap gap-2">
        {item.estado === "propuesto" ? (
          <>
            <button
              type="button"
              className="boton-compacto boton-principal"
              onClick={() => onConfirmar(item)}
              data-testid={`confirmar-${item.clave}`}
            >
              Confirmar
            </button>
            <button
              type="button"
              className="boton-compacto boton-secundario"
              onClick={() => onAbrir(item)}
              data-testid={`corregir-${item.clave}`}
            >
              Corregir
            </button>
          </>
        ) : item.estado === "falta" ? (
          <button
            type="button"
            className={`boton-compacto ${item.opcional ? "boton-secundario" : "boton-principal"}`}
            onClick={() => onAbrir(item)}
            data-testid={`marcar-${item.clave}`}
          >
            {item.abre.tipo === "c1"
              ? "Contestar"
              : item.texto.startsWith("Dónde fue el hecho")
                ? "Buscar el lugar"
                : "Marcar en el mapa"}
          </button>
        ) : (
          <button
            type="button"
            className="boton-compacto boton-secundario"
            onClick={() => onAbrir(item)}
            data-testid={`cambiar-${item.clave}`}
          >
            Cambiar
          </button>
        )}
      </div>
    </li>
  );
}

export function ListaEscena({
  items,
  listo,
  onConfirmar,
  onAbrir,
  onVer,
  guia,
  onCerrarGuia,
}: {
  items: readonly ItemEscena[];
  /** Todo lo obligatorio está: «Ver la reconstrucción» se activa. */
  listo: boolean;
  onConfirmar: (i: ItemEscena) => void;
  onAbrir: (i: ItemEscena) => void;
  onVer: () => void;
  /** La guía corta al entrar (se cierra y no vuelve en el caso). */
  guia: boolean;
  onCerrarGuia: () => void;
}) {
  const obligatorios = items.filter((i) => !i.opcional);
  const hechos = obligatorios.filter((i) => i.estado === "confirmado").length;
  const propuestos = items.filter((i) => i.estado === "propuesto");
  const faltan = obligatorios.filter((i) => i.estado === "falta");
  return (
    <section
      className="escena-hoja absolute right-0 bottom-0 left-0 z-10 flex max-h-[52vh] flex-col gap-3 overflow-y-auto rounded-b-none p-5 md:top-6 md:right-auto md:bottom-6 md:left-6 md:max-h-none md:w-[440px] md:rounded-[22px] md:p-6"
      aria-label="Lo que falta en la escena"
      data-testid="lista-escena"
    >
      <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-texto-3 uppercase">
        La escena · revisa y corrige
      </span>
      <h2 className="text-[1.5rem] leading-tight font-semibold">
        {propuestos.length ? "Croquis armó la escena. Revísala." : "La escena"}
      </h2>
      {guia ? (
        <div className="hundido flex flex-col gap-2 rounded-control p-3" data-testid="guia-escena">
          <ol className="t-nota flex list-decimal flex-col gap-1 pl-5">
            <li>
              Lo <b>propuesto</b> lo puso Croquis con lo que leyó: confírmalo o corrígelo.
            </li>
            <li>
              Toca un vehículo, una persona o un objeto para moverlo; gíralo con su anillo o con Q y
              E; A lo alinea con la calle y F lo voltea.
            </li>
            <li>
              {faltan.length
                ? `Falta lo que solo tú sabes: ${faltan[0]!.texto.toLowerCase()}${faltan.length > 1 ? ` y ${faltan.length - 1} más` : ""}.`
                : "No falta nada obligatorio: revisa lo propuesto y ve la reconstrucción."}
            </li>
          </ol>
          <button
            type="button"
            className="boton-compacto boton-secundario self-start"
            onClick={onCerrarGuia}
            data-testid="cerrar-guia"
          >
            Entendido
          </button>
        </div>
      ) : null}
      <ul aria-label="Lo propuesto y lo que falta">
        {items.map((i) => (
          <Fila key={i.clave} item={i} onConfirmar={onConfirmar} onAbrir={onAbrir} />
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-2 border-t border-linea-suave pt-4">
        <span className="t-nota" data-testid="avance-lista">
          {hechos} de {obligatorios.length} listos
          {propuestos.length ? ` · ${propuestos.length} por confirmar` : ""}
        </span>
        <button
          type="button"
          className="boton-principal"
          disabled={!listo}
          onClick={onVer}
          data-testid="lista-ver-reconstruccion"
        >
          Ver la reconstrucción →
        </button>
        {!listo ? (
          <span className="t-nota">
            {faltan.length
              ? `Para seguir falta: ${faltan.map((f) => f.texto.toLowerCase()).join("; ")}.`
              : "Contesta las preguntas que faltan o di «No sé»."}
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** Las herramientas a la vista desde el primer instante, cada una con su tecla. */
export function HerramientasEscena({
  haySeleccion,
  onGirar,
  onAlinear,
  onVoltear,
  onDeshacer,
  onRehacer,
  puedeDeshacer,
  puedeRehacer,
  onAcercar,
  onAlejar,
  midiendo,
  onMedir,
}: {
  haySeleccion: boolean;
  onGirar: (grados: number) => void;
  onAlinear: () => void;
  onVoltear: () => void;
  onDeshacer: () => void;
  onRehacer: () => void;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  onAcercar: () => void;
  onAlejar: () => void;
  midiendo: boolean;
  onMedir: () => void;
}) {
  const boton = (
    id: string,
    texto: string,
    tecla: string,
    hacer: () => void,
    activo = true,
    presionado?: boolean,
  ) => (
    <button
      key={id}
      type="button"
      onClick={hacer}
      disabled={!activo}
      aria-pressed={presionado}
      aria-keyshortcuts={tecla}
      title={`${texto} (${tecla})`}
      className="flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-[0.8125rem] hover:bg-hundido disabled:opacity-40 aria-pressed:bg-texto aria-pressed:text-fondo"
      data-testid={`herramienta-${id}`}
    >
      <span>{texto}</span>
      <kbd className="rounded border border-linea-suave px-1 font-mono text-[0.6875rem] text-texto-3">
        {tecla}
      </kbd>
    </button>
  );
  return (
    <div
      className="vidrio pointer-events-auto flex flex-wrap items-center gap-0.5 rounded-panel p-1"
      role="toolbar"
      aria-label="Herramientas de la escena"
      data-testid="herramientas-escena"
    >
      {boton("girar-izq", "Girar ↺", "Q", () => onGirar(-15), haySeleccion)}
      {boton("girar-der", "Girar ↻", "E", () => onGirar(15), haySeleccion)}
      {boton("alinear", "Alinear con la calle", "A", onAlinear, haySeleccion)}
      {boton("voltear", "Voltear 180°", "F", onVoltear, haySeleccion)}
      {boton("deshacer", "Deshacer", "Ctrl+Z", onDeshacer, puedeDeshacer)}
      {boton("rehacer", "Rehacer", "Ctrl+Y", onRehacer, puedeRehacer)}
      {boton("acercar", "Acercar", "+", onAcercar)}
      {boton("alejar", "Alejar", "−", onAlejar)}
      {boton("medir", "Medir", "M", onMedir, true, midiendo)}
    </div>
  );
}
