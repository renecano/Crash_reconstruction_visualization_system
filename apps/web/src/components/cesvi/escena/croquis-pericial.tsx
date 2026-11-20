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
      <div ref={caja} className="relative min-h-0 flex-1 bg-white">
        {/* El SVG lo arma `croquisPericial` con datos del solver: el mismo del dictamen. */}
        <div
          className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {fondo === "foto" ? (
          <div className="vidrio absolute bottom-3 left-3 flex items-center gap-2 rounded-panel p-2 text-[0.75rem]">
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
            (gris). Igual B y los demás.
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
