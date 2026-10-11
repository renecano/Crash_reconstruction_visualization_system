import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, compareSchemaVersions } from "./index";

describe("scene-schema", () => {
  it("expone una versión semántica", () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("compara versiones", () => {
    expect(compareSchemaVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareSchemaVersions("1.0.0", "1.1.0")).toBe(-1);
    expect(compareSchemaVersions("2.0.0", "1.9.9")).toBe(1);
  });

  it("rechaza versiones mal formadas", () => {
    expect(() => compareSchemaVersions("1.0", "1.0.0")).toThrow(/inválida/);
  });
});
