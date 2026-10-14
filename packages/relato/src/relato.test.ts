import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findTerms } from "./glossary";
import { countByKind, redact } from "./pii";
import { fold } from "./text";

describe("plegado", () => {
  it("quita acentos y baja a minúsculas", () => {
    expect(fold("Frené en la AVENIDA Ñandú")).toBe("frene en la avenida nandu");
  });

  it("conserva la longitud UTF-16 con cualquier texto", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 80 }), (s) => {
        expect(fold(s).length).toBe(s.length);
      }),
    );
  });

  it("es idempotente", () => {
    fc.assert(fc.property(fc.string({ maxLength: 80 }), (s) => fold(fold(s)) === fold(s)));
  });
});

describe("redactor de datos personales", () => {
  it("redacta nombre, placa, teléfono y correo", () => {
    const r = redact("Me llamo Ana López, placas ABC-12-34, tel 7221234567, ana@correo.mx");
    expect(r.text).toBe("Me llamo [NOMBRE], placas [PLACA], tel [TELEFONO], [CORREO]");
    expect(countByKind(r)).toMatchObject({ NOMBRE: 1, PLACA: 1, TELEFONO: 1, CORREO: 1 });
  });

  it("los tramos apuntan al original y no se traslapan", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 200 }), (s) => {
        const r = redact(s);
        let prev = 0;
        let rebuilt = "";
        for (const sp of r.spans) {
          expect(sp.start).toBeGreaterThanOrEqual(prev);
          expect(s.slice(sp.start, sp.end)).toBe(sp.original);
          rebuilt += s.slice(prev, sp.start) + `[${sp.kind}]`;
          prev = sp.end;
        }
        expect(rebuilt + s.slice(prev)).toBe(r.text);
      }),
    );
  });

  it("nunca deja pasar placas, correos ni teléfonos generados", () => {
    const upper = fc.constantFrom(..."ABCDEFGHJKLMNPRSTUVWXYZ");
    const digit = fc.constantFrom(..."0123456789");
    const lower = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz");
    const placa = fc
      .tuple(
        fc.array(upper, { minLength: 3, maxLength: 3 }),
        fc.array(digit, { minLength: 3, maxLength: 3 }),
        upper,
      )
      .map(([a, b, c]) => `${a.join("")}-${b.join("")}-${c}`);
    const correo = fc
      .tuple(
        fc.array(lower, { minLength: 3, maxLength: 8 }),
        fc.array(lower, { minLength: 3, maxLength: 8 }),
      )
      .map(([a, b]) => `${a.join("")}@${b.join("")}.com`);
    const tel = fc
      .array(digit, { minLength: 7, maxLength: 7 })
      .map((d) => `722 ${d.slice(0, 3).join("")} ${d.slice(3).join("")}`);
    fc.assert(
      fc.property(placa, correo, tel, (p, c, t) => {
        const out = redact(`Las placas eran ${p}, mi correo ${c} y mi número ${t}.`).text;
        for (const dato of [p, c, t]) expect(out).not.toContain(dato);
      }),
    );
  });

  it("no toca calles ni números que no son datos personales", () => {
    for (const s of [
      "en la esquina de Benito Juárez con Miguel Hidalgo",
      "iba a 60 km/h y frené unos 12 metros antes, eran las 10:30",
    ]) {
      expect(redact(s).text).toBe(s);
    }
  });
});

describe("glosario", () => {
  it("encuentra expresiones con su cita literal y pregunta si es ambigua", () => {
    const text = "Se me cerró una camioneta y el tráiler se pasó el alto";
    const terms = findTerms(text);
    expect(terms.map((t) => t.id)).toEqual([
      "se_me_cerro",
      "camioneta",
      "trailer",
      "se_paso_el_alto",
    ]);
    for (const t of terms) expect(text.slice(t.start, t.end)).toBe(t.texto);
    expect(terms[0]!.ambiguo).toBe(true);
    expect(terms[0]!.pregunta).toBeTruthy();
  });

  it("coincidencias sin traslapes", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        const terms = findTerms(s);
        for (let k = 1; k < terms.length; k++) {
          expect(terms[k - 1]!.end).toBeLessThanOrEqual(terms[k]!.start);
        }
      }),
    );
  });
});
