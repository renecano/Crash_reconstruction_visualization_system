import { Composition } from "remotion";
import { Prueba } from "./Prueba";

/** Las composiciones del tráiler. Por ahora, solo la prueba técnica del pipeline. */
export function Root() {
  return (
    <Composition
      id="Prueba"
      component={Prueba}
      durationInFrames={150}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ toma3d: null as string | null }}
    />
  );
}
