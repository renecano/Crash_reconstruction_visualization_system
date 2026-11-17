import { describe, expect, it } from "vitest";
import { mediosProhibidos } from "./sin-medios.mjs";

describe("el candado contra video y audio en git", () => {
  it("rechaza video y audio fuera de la portada, sin importar mayúsculas ni carpeta", () => {
    expect(
      mediosProhibidos([
        "video_referencia.MP4",
        "docs/demo.mov",
        "trailer-salida/musica/croquis-trailer.wav",
        "apps/trailer/pista.mp3",
        "a/b/c.M4A",
      ]),
    ).toEqual([
      "video_referencia.MP4",
      "docs/demo.mov",
      "trailer-salida/musica/croquis-trailer.wav",
      "apps/trailer/pista.mp3",
      "a/b/c.M4A",
    ]);
  });

  it("deja pasar las tomas de la portada y todo lo que no es video ni audio", () => {
    expect(
      mediosProhibidos([
        "apps/web/public/portada/toma-1.mp4",
        "apps/web/public/portada/toma-1-movil.mp4",
        "apps/web/public/portada/sub/otra.mp4",
        "docs/captura.png",
        "README.md",
        "notas.mp4.txt",
        "apps\\web\\public\\portada\\toma-2.mp4",
      ]),
    ).toEqual([]);
  });

  it("no confunde una carpeta que solo se parece a la de la portada", () => {
    expect(
      mediosProhibidos(["apps/web/public/portada-vieja/x.mp4", "public/portada/x.mp4"]),
    ).toEqual(["apps/web/public/portada-vieja/x.mp4", "public/portada/x.mp4"]);
  });
});
