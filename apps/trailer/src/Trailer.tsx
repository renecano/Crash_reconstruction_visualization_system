/**
 * El tráiler de Croquis (storyboard versión 2, aprobado por René el 2026-11-16): 28 s sobre una sola
 * rejilla de pulsos (`ritmo.json`), la misma de la música. El mismo componente sirve para los tres
 * formatos (1920×1080, 3840×2160 y 1080×1920): cada escena se acomoda al cuadro.
 */
import { useEffect } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Frases } from "./escenas/Frases";
import { Logo } from "./escenas/Logo";
import { Papel } from "./escenas/Papel";
import { cargarFuentes } from "./fuentes";
import { cuadroDe, entre, FPS, MOMENTOS, sale, tramo } from "./ritmo";
import { GranoDePelicula } from "./texturas";
import { hay, Toma, type TomasDisponibles } from "./tomas";

export type PropsDelTrailer = {
  /** Las tomas del 3D que hay en la carpeta de tomas, por hueco. */
  tomas: TomasDisponibles;
  /** El archivo de la música en la carpeta pública del render, o `null` para un render mudo. */
  musica: string | null;
};

/** La toma del 3D que sale del papel: entra cuando la hoja ya se inclinó. */
function DelPapelAl3d({ tomas }: { tomas: TomasDisponibles }) {
  const cuadro = useCurrentFrame();
  const s = cuadro / FPS;
  const dura = tramo("trayectorias").hasta / FPS - MOMENTOS.del_papel_al_3d;
  return (
    <Toma
      tomas={tomas}
      hueco="heroe"
      avance={s / dura}
      acerca={[1.09, 1]}
      opacidad={sale(entre(s, 0, 0.45))}
    />
  );
}

export function Trailer({ tomas, musica }: PropsDelTrailer) {
  useEffect(() => {
    void cargarFuentes();
  }, []);
  const frases = tramo("frases");
  const logo = tramo("logo");
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Sequence durationInFrames={frases.desde}>
        <Papel />
      </Sequence>
      {hay(tomas, "heroe") ? (
        <Sequence
          from={cuadroDe(MOMENTOS.del_papel_al_3d)}
          durationInFrames={frases.desde - cuadroDe(MOMENTOS.del_papel_al_3d)}
        >
          <DelPapelAl3d tomas={tomas} />
        </Sequence>
      ) : null}
      <Sequence from={frases.desde} durationInFrames={frases.cuadros}>
        <Frases tomas={tomas} />
      </Sequence>
      <Sequence from={logo.desde} durationInFrames={logo.cuadros}>
        <Logo />
      </Sequence>
      <GranoDePelicula intensidad={0.07} />
      {musica ? <Audio src={staticFile(musica)} /> : null}
    </AbsoluteFill>
  );
}
