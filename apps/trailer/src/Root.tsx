import { Composition } from "remotion";
import { Prueba } from "./Prueba";
import { CUADROS, FPS } from "./ritmo";
import { Trailer, type PropsDelTrailer } from "./Trailer";

const SIN_NADA: PropsDelTrailer = { tomas: {}, musica: null };

/** Los tres formatos que pidió René, con la misma composición. */
export const FORMATOS = [
  { id: "Trailer", ancho: 1920, alto: 1080 },
  { id: "Trailer4K", ancho: 3840, alto: 2160 },
  { id: "TrailerVertical", ancho: 1080, alto: 1920 },
] as const;

/** Las composiciones: el tráiler en sus tres formatos y la prueba técnica del pipeline. */
export function Root() {
  return (
    <>
      {FORMATOS.map((f) => (
        <Composition
          key={f.id}
          id={f.id}
          component={Trailer}
          durationInFrames={CUADROS}
          fps={FPS}
          width={f.ancho}
          height={f.alto}
          defaultProps={SIN_NADA}
        />
      ))}
      <Composition
        id="Prueba"
        component={Prueba}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ toma3d: null as string | null }}
      />
    </>
  );
}
