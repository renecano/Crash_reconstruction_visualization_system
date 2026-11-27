"use client";
/**
 * El 2D de Reconstrucción como croquis de perito (ronda 4, propuesta 2 elegida por René): el SVG de
 * `croquisPericial` (el mismo del dictamen), con «Fondo» (ninguno, el mapa tenue o la foto satelital
 * con su ajuste), «Color por velocidad» y el cuadro de referencias plegable, fuera del dibujo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePisoMapaReal } from "@/components/visor-unity/mapa-real";
import { EnRanura } from "@/components/visor-unity/marco-vista";
import type { Reconstruccion } from "@croquis/cesvi";
import { croquisPericial, type ViaCroquis } from "@/lib/croquis-pericial";
import type { ResultadoMaqueta } from "@/lib/maqueta";
import { ajustar, ajusteEnPalabras, PASO_AJUSTE_M, SIN_AJUSTE } from "@/lib/visor-unity/piso";
import { factorRueda, mover, PASO_ZOOM, VISTA_INICIAL, zoomEn, type Vista } from "@/lib/zoom-vista";
import type { PedidoVista } from "./maqueta";

type Fondo = "ninguno" | "mapa" | "foto";

export function CroquisPericialVista({
  r,
  resultado,
  vias,
  nombres,
  t,
  pedido,
}: {
  r: Reconstruccion;
  resultado: ResultadoMaqueta;
  vias: readonly ViaCroquis[];
  /** «A · Nissan Micra», por id del resultado. */
  nombres: Record<string, string>;
  t: number | null;
  pedido: PedidoVista | null;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [proporcion, setProporcion] = useState(1.6);
  useEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const o = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setProporcion(Math.round((width / height) * 100) / 100);
    });
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const [todo, setTodo] = useState(false);
  const [pedidoVisto, setPedidoVisto] = useState<number | null>(null);
  // «Ver todo» e «Ir al impacto» de la barra de reproducción.
  if (pedido && pedido.n !== pedidoVisto) {
    setPedidoVisto(pedido.n);
    setTodo(pedido.tipo === "todo");
  }
  const [color, setColor] = useState(false);
  const [fondo, setFondo] = useState<Fondo>("ninguno");
  const [ajuste, setAjuste] = useState(SIN_AJUSTE);
  const piso = usePisoMapaReal(r.resultado, r.origen, {
    activo: fondo !== "ninguno",
    conFoto: fondo === "foto",
    ajuste,
  });
  const { svg } = useMemo(
    () =>
      croquisPericial(resultado, vias, nombres, {
        proporcion,
        todo,
        color,
        t,
        fondo:
          fondo !== "ninguno" && piso.piso
            ? {
                imagen: fondo === "foto" ? piso.piso.imagenVivo : piso.piso.imagenMapa,
                centroX: piso.piso.centro_x,
                centroY: piso.piso.centro_y,
                ladoM: piso.piso.lado_m,
                opacidad: fondo === "foto" ? 0.5 : 0.3,
              }
            : null,
      }),
    [resultado, vias, nombres, proporcion, todo, color, t, fondo, piso.piso],
  );
  const letras = Object.values(nombres);

  // Acercar y alejar (René, 2026-11-25): botones, rueda del mouse y pellizco; acercado, se arrastra.
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL);
  const medida = () => {
    const b = caja.current?.getBoundingClientRect();
    return { ancho: b?.width ?? 1, alto: b?.height ?? 1, izq: b?.left ?? 0, arriba: b?.top ?? 0 };
  };
  const zoomBoton = (factor: number) => {
    const m = medida();
    setVista((v) => zoomEn(v, factor, m.ancho / 2, m.alto / 2, m.ancho, m.alto));
  };
  // La rueda, con `passive: false` para que no desplace la página mientras acerca.
  useEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const rueda = (ev: WheelEvent) => {
      ev.preventDefault();
      const b = el.getBoundingClientRect();
      setVista((v) =>
        zoomEn(
          v,
          factorRueda(ev.deltaY),
          ev.clientX - b.left,
          ev.clientY - b.top,
          b.width,
          b.height,
        ),
      );
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, []);
  // Arrastrar (un dedo o el mouse) y pellizcar (dos dedos).
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const alPresionar = (ev: React.PointerEvent) => {
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
  };
  const alMover = (ev: React.PointerEvent) => {
    const antes = punteros.current.get(ev.pointerId);
    if (!antes) return;
    const m = medida();
    const otros = [...punteros.current.entries()].filter(([id]) => id !== ev.pointerId);
    if (otros.length === 1) {
      const o = otros[0]![1];
      const d0 = Math.hypot(antes.x - o.x, antes.y - o.y);
      const d1 = Math.hypot(ev.clientX - o.x, ev.clientY - o.y);
      if (d0 > 0) {
        const cx = (ev.clientX + o.x) / 2 - m.izq;
        const cy = (ev.clientY + o.y) / 2 - m.arriba;
        setVista((v) => zoomEn(v, d1 / d0, cx, cy, m.ancho, m.alto));
      }
    } else if (otros.length === 0) {
      setVista((v) => mover(v, ev.clientX - antes.x, ev.clientY - antes.y, m.ancho, m.alto));
    }
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  };
  const alSoltar = (ev: React.PointerEvent) => {
    punteros.current.delete(ev.pointerId);
  };
  return (
    <div className="flex h-full w-full flex-col" data-testid="croquis-pericial">
      <EnRanura ranura="derecha">
        <div className="segmentado" role="group" aria-label="Fondo del croquis">
          {(
            [
              ["ninguno", "Sin fondo"],
              ["mapa", "Mapa"],
              ["foto", "Foto"],
            ] as const
          ).map(([f, texto]) => (
            <button
              key={f}
              type="button"
              aria-pressed={fondo === f}
              className="px-3"
              onClick={() => setFondo(f)}
              data-testid={`croquis-fondo-${f}`}
            >
              {texto}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={color}
          className="vidrio rounded-full px-3 py-1.5 text-[0.8125rem] font-medium"
          onClick={() => setColor(!color)}
          data-testid="croquis-color"
        >
          Color por velocidad
        </button>
      </EnRanura>
      <div
        ref={caja}
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-white"
        onPointerDown={alPresionar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        data-zoom={Math.round(vista.k * 100) / 100}
        data-testid="croquis-caja"
      >
        {/* El SVG lo arma `croquisPericial` con datos del solver: el mismo del dictamen. */}
        <div
          className="h-full w-full origin-top-left [&>svg]:h-full [&>svg]:w-full"
          style={{ transform: `translate(${vista.dx}px, ${vista.dy}px) scale(${vista.k})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div
          className="vidrio absolute right-3 top-3 flex flex-col gap-1 rounded-panel p-1"
          role="group"
          aria-label="Acercar el croquis"
          onPointerDown={(ev) => ev.stopPropagation()}
        >
          <button
            type="button"
            className="boton-compacto boton-secundario h-8 w-8 px-0"
            aria-label="Acercar"
            onClick={() => zoomBoton(PASO_ZOOM)}
            data-testid="croquis-acercar"
          >
            +
          </button>
          <button
            type="button"
            className="boton-compacto boton-secundario h-8 w-8 px-0"
            aria-label="Alejar"
            onClick={() => zoomBoton(1 / PASO_ZOOM)}
            data-testid="croquis-alejar"
          >
            −
          </button>
          <button
            type="button"
            className="boton-compacto boton-secundario h-8 w-8 px-0 text-[0.6875rem]"
            aria-label="Ver el croquis completo"
            onClick={() => setVista(VISTA_INICIAL)}
            disabled={vista.k === 1}
            data-testid="croquis-zoom-completo"
          >
            1:1
          </button>
        </div>
        {fondo === "foto" ? (
          <div
            className="vidrio absolute bottom-3 left-3 flex items-center gap-2 rounded-panel p-2 text-[0.75rem]"
            onPointerDown={(ev) => ev.stopPropagation()}
          >
            <span>Ajustar la foto:</span>
            {(
              [
                ["↑", 0, PASO_AJUSTE_M, "norte"],
                ["↓", 0, -PASO_AJUSTE_M, "sur"],
                ["←", -PASO_AJUSTE_M, 0, "oeste"],
                ["→", PASO_AJUSTE_M, 0, "este"],
              ] as const
            ).map(([s, de, dn, nombre]) => (
              <button
                key={nombre}
                type="button"
                className="boton-compacto boton-secundario h-7 w-7 px-0"
                aria-label={`Mover la foto al ${nombre}`}
                onClick={() => setAjuste((a) => ajustar(a, de, dn))}
              >
                {s}
              </button>
            ))}
            <span className="cifras">{ajusteEnPalabras(ajuste)}</span>
            {piso.aviso ? <span className="text-senal-texto">{piso.aviso}</span> : null}
          </div>
        ) : null}
      </div>
      <details
        className="border-t border-linea-suave px-3 py-2 text-[0.75rem]"
        data-testid="croquis-referencias"
      >
        <summary className="cursor-pointer font-medium">Referencias del croquis</summary>
        <ul className="mt-1 grid gap-1 sm:grid-cols-2">
          <li>
            <b>A1, A2, A3</b>: el vehículo A antes del impacto (punteado), en el impacto y en reposo
            (gris). Igual B y los demás. «B1·2»: B estaba detenido, antes del impacto y en el
            impacto en el mismo lugar.
          </li>
          <li>
            <b>+ / −</b>: acercar y alejar (también con la rueda del mouse o pellizcando); acercado,
            se arrastra. <b>1:1</b> vuelve al croquis completo.
          </li>
          <li>
            <b>✕ Impacto</b>: el punto de impacto de la reconstrucción.
          </li>
          <li>
            Línea punteada: el recorrido{color ? ", del azul (lento) al naranja (rápido)" : ""}.
          </li>
          <li>La vía con sus bordes y carriles; el norte y la escala, en el dibujo.</li>
          <li>Vehículos: {letras.join(" · ") || "—"}.</li>
          {fondo !== "ninguno" && piso.piso ? (
            <li>
              Fondo ilustrativo:{" "}
              {fondo === "foto" ? piso.piso.atribucionVivo : piso.piso.atribucionMapa}.
            </li>
          ) : null}
        </ul>
      </details>
    </div>
  );
}
