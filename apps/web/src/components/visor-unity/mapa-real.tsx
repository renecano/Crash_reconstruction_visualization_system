"use client";
/**
 * El modo «mapa real» del 3D (ronda 4, punto 9; ADR 0124): el lugar como piso, en vez del entorno
 * procedural. El mapa de OpenStreetMap siempre; la foto satelital de Esri encima cuando hay internet,
 * con su atribución y un ajuste para alinearla. Es ilustrativo: la foto puede estar corrida.
 */
import type { LonLat } from "@croquis/cesvi";
import { useEffect, useMemo, useRef, useState } from "react";
import { estiloMapaEscena } from "@/components/cesvi/escena/estilo-mapa-escena";
import {
  ajustar,
  ajusteEnPalabras,
  atribucionDelPiso,
  ATRIBUCION_MAPA,
  componer,
  dibujarCapas,
  PASO_AJUSTE_M,
  pisoDelCaso,
  SIN_AJUSTE,
  type AjusteFoto,
  type CapasPiso,
  type PisoUnity,
} from "@/lib/visor-unity/piso";

export interface EstadoMapaReal {
  activo: boolean;
  conFoto: boolean;
  ajuste: AjusteFoto;
}
export const MAPA_REAL_APAGADO: EstadoMapaReal = {
  activo: false,
  conFoto: true,
  ajuste: SIN_AJUSTE,
};

/**
 * Dibuja el piso del caso cuando el modo está activo, y lo vuelve a componer al mover la foto (con
 * una pausa de 300 ms: no se manda una imagen por cada flecha).
 */
export function usePisoMapaReal(
  resultado: unknown,
  origen: LonLat | null,
  e: EstadoMapaReal,
): { piso: PisoUnity | null; aviso: string | null; cargando: boolean } {
  const caso = useMemo(() => (origen ? pisoDelCaso(resultado, origen) : null), [resultado, origen]);
  const [capas, setCapas] = useState<{ de: string; c: CapasPiso } | null>(null);
  const [piso, setPiso] = useState<PisoUnity | null>(null);
  const clave = caso
    ? `${caso.centroX},${caso.centroY},${caso.ladoM},${caso.origen.join(",")}|${e.conFoto}`
    : "";
  const pedida = useRef("");
  useEffect(() => {
    if (!e.activo || !caso || pedida.current === clave) return;
    pedida.current = clave;
    let vivo = true;
    void dibujarCapas(caso, estiloMapaEscena("claro"), e.conFoto).then((c) => {
      if (vivo && c) setCapas({ de: clave, c });
    });
    return () => {
      vivo = false;
      pedida.current = "";
    };
  }, [e.activo, e.conFoto, caso, clave]);
  useEffect(() => {
    if (!e.activo || !caso || !capas || capas.de !== clave) {
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      void Promise.all([
        componer(capas.c, caso, SIN_AJUSTE, false),
        componer(capas.c, caso, e.ajuste, e.conFoto),
      ]).then(([imagenMapa, imagenVivo]) => {
        if (!vivo) return;
        setPiso({
          centro_x: caso.centroX,
          centro_y: caso.centroY,
          lado_m: caso.ladoM,
          imagenMapa,
          imagenVivo,
          atribucionMapa: ATRIBUCION_MAPA,
          atribucionVivo: atribucionDelPiso(capas.c, e.conFoto),
        });
      });
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [e.activo, e.conFoto, e.ajuste, caso, capas, clave]);
  const aviso = e.activo && e.conFoto && capas?.de === clave ? capas.c.sinFoto : null;
  // Dibujando: activo y sin las capas de este caso todavía (o sin la imagen compuesta).
  const cargando = e.activo && caso !== null && (capas?.de !== clave || piso === null);
  // Mientras se vuelve a dibujar (al encender o apagar la foto) se queda el piso anterior: Unity no
  // regresa al entorno procedural ni un momento.
  return { piso: e.activo ? piso : null, aviso, cargando };
}

const FLECHAS: { texto: string; etiqueta: string; d: [number, number] }[] = [
  { texto: "↑", etiqueta: "Mover la foto al norte", d: [0, PASO_AJUSTE_M] },
  { texto: "←", etiqueta: "Mover la foto al oeste", d: [-PASO_AJUSTE_M, 0] },
  { texto: "→", etiqueta: "Mover la foto al este", d: [PASO_AJUSTE_M, 0] },
  { texto: "↓", etiqueta: "Mover la foto al sur", d: [0, -PASO_AJUSTE_M] },
];

/** El panel del modo: la foto satelital, su ajuste, el aviso y el crédito de lo que se ve. */
export function PanelMapaReal({
  e,
  onCambio,
  aviso,
  cargando,
  atribucion,
}: {
  e: EstadoMapaReal;
  onCambio: (e: EstadoMapaReal) => void;
  aviso: string | null;
  cargando: boolean;
  atribucion: string;
}) {
  const conFoto = e.conFoto && !aviso;
  return (
    <div
      className="vidrio pointer-events-auto flex max-w-[22rem] flex-col gap-2 rounded-panel p-3 text-[0.8125rem]"
      data-testid="panel-mapa-real"
    >
      <label className="flex items-center justify-between gap-3">
        <span className="font-medium">Foto satelital</span>
        <button
          type="button"
          role="switch"
          aria-checked={e.conFoto}
          onClick={() => onCambio({ ...e, conFoto: !e.conFoto })}
          className="boton-compacto boton-secundario"
          data-testid="foto-satelital"
        >
          {e.conFoto ? "Encendida" : "Apagada"}
        </button>
      </label>
      {conFoto ? (
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Ajustar la foto">
            {FLECHAS.map((f, k) => (
              <button
                key={f.etiqueta}
                type="button"
                aria-label={f.etiqueta}
                className={`boton-compacto boton-secundario h-8 w-8 px-0 ${["col-start-2", "col-start-1 row-start-2", "col-start-3 row-start-2", "col-start-2 row-start-3"][k]}`}
                onClick={() => onCambio({ ...e, ajuste: ajustar(e.ajuste, f.d[0], f.d[1]) })}
                data-testid={`ajuste-foto-${["norte", "oeste", "este", "sur"][k]}`}
              >
                {f.texto}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <span className="cifras" data-testid="ajuste-foto">
              {ajusteEnPalabras(e.ajuste)}
            </span>
            <button
              type="button"
              className="boton-compacto boton-secundario self-start"
              onClick={() => onCambio({ ...e, ajuste: SIN_AJUSTE })}
              disabled={!e.ajuste.esteM && !e.ajuste.norteM}
            >
              Restablecer
            </button>
          </div>
        </div>
      ) : null}
      <p className="t-nota">
        Ilustrativo: la foto satelital puede estar corrida de 5 a 8.5 m; alinéala con las calles. El
        video y el paquete 3D llevan solo el mapa.
      </p>
      {aviso || cargando ? (
        <p role="status" className="t-nota text-senal-texto" data-testid="aviso-mapa-real">
          {cargando ? "Dibujando el lugar…" : aviso}
        </p>
      ) : null}
      <p className="text-[0.6875rem] text-texto-3" data-testid="atribucion-mapa-real">
        {atribucion}
      </p>
    </div>
  );
}
