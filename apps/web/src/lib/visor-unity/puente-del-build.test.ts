import { conCamaraAutomatica, conTrayectoPrevio } from "@croquis/scene-schema";
import { describe, expect, it } from "vitest";
import { puenteDelManifiesto } from "./puente-del-build";

describe("lo que ofrece la web según el build publicado (René, 2026-11-27)", () => {
  it("lee la versión del puente del manifiesto; sin ella, o mal escrita, null", () => {
    expect(puenteDelManifiesto({ puente: "1.4.0" })).toBe("1.4.0");
    expect(puenteDelManifiesto({ puente: "uno" })).toBeNull();
    expect(puenteDelManifiesto({})).toBeNull();
    expect(puenteDelManifiesto(null)).toBeNull();
  });
  it("el 8a302a (1.4.0) no trae trayecto previo ni cámara automática; la 1.5.0 sí", () => {
    for (const v of ["1.4.0", null]) {
      expect(conTrayectoPrevio(v)).toBe(false);
      expect(conCamaraAutomatica(v)).toBe(false);
    }
    expect(conTrayectoPrevio("1.5.0")).toBe(true);
    expect(conCamaraAutomatica("1.5.0")).toBe(true);
  });
});
