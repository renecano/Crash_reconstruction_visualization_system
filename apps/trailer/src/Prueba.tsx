/**
 * El render de prueba (5 s a 1920×1080): confirma que el pipeline funciona con las cuatro texturas y
 * una toma del 3D. No es una propuesta creativa: solo pone cada pieza en pantalla un rato.
 */
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame } from "remotion";
import { GranoDePelicula, PapelConGrano, PapelMilimetrico, TintaQueSeExpande } from "./texturas";

export function Prueba({ toma3d }: { toma3d: string | null }) {
  const cuadro = useCurrentFrame();
  return (
    <AbsoluteFill>
      <PapelConGrano vivo />
      <Sequence from={0} durationInFrames={150}>
        <PapelMilimetrico desde={0} hasta={45} />
      </Sequence>
      <Sequence from={30} durationInFrames={120}>
        <TintaQueSeExpande x={0.3} y={0.55} radio={0.22} desde={0} hasta={40} />
      </Sequence>
      {toma3d ? (
        <Sequence from={75} durationInFrames={75}>
          <AbsoluteFill
            style={{
              left: "45%",
              top: "18%",
              width: "48%",
              height: "64%",
              opacity: Math.min(1, (cuadro - 75) / 15),
            }}
          >
            <Img
              src={staticFile(toma3d)}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </AbsoluteFill>
        </Sequence>
      ) : null}
      <GranoDePelicula rayas />
    </AbsoluteFill>
  );
}
