/**
 * @croquis/scene-schema — el contrato EscenaSpec.
 *
 * `escena.schema.json` es la única fuente de verdad. `generated/escena.zod.ts` se genera con
 * `pnpm generate`; nunca se edita a mano.
 */
export * from "./generated/escena.zod";
export {
  CONFIANZA_BAJA,
  boxesOverlap,
  checkEscena,
  erroresDe,
  longitudM,
  masaKg,
  velocidadKmh,
  type CheckOptions,
  type Problema,
  type RangoClase,
  type Severidad,
  type TablaClases,
} from "./check";
export {
  FIXTURE_NAMES,
  RAW_FIXTURES,
  fixtureTitle,
  loadFixture,
  type FixtureName,
} from "./fixtures";
export {
  escenaSchema,
  isValidEscena,
  schemaErrors,
  validateEscena,
  type ValidationResult,
} from "./validate";
export { MIGRATIONS, migrateEscena, type Migration, type MigrationResult } from "./migrate";
export { compareSchemaVersions, parseSemver } from "./version";
