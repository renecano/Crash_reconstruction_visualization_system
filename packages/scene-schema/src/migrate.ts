/**
 * Migraciones del contrato entre versiones de esquema (PLAN §4.2).
 *
 * Cada migración transforma un documento crudo (no validado) de la versión `desde` a `hasta`.
 * `migrateEscena` encadena migraciones hasta llegar a `SCHEMA_VERSION`. El registro vive aquí y
 * se refleja en `python/croquis_scene_schema/migrate.py`; las pruebas de ambos lados usan los
 * mismos documentos de `fixtures/migrations/`.
 */
import { SCHEMA_VERSION } from "./generated/escena.zod";
import { compareSchemaVersions, parseSemver } from "./version";

export interface Migration {
  desde: string;
  hasta: string;
  descripcion: string;
  aplicar: (doc: Record<string, unknown>) => Record<string, unknown>;
}

/** Migraciones registradas, en orden ascendente. Vacío mientras solo exista la 1.0.0. */
export const MIGRATIONS: Migration[] = [];

export interface MigrationResult {
  doc: Record<string, unknown>;
  aplicadas: string[];
  desde: string;
  hasta: string;
}

function versionOf(doc: unknown): string {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("El documento no es un objeto.");
  const meta = (doc as Record<string, unknown>).meta;
  const v = meta && typeof meta === "object" ? (meta as Record<string, unknown>).version_esquema : undefined;
  if (typeof v !== "string") throw new Error("El documento no declara meta.version_esquema.");
  parseSemver(v);
  return v;
}

/**
 * Lleva un documento a la versión vigente aplicando las migraciones necesarias. No valida el
 * resultado: eso lo hace `validateEscena`. Lanza si la versión es desconocida o más nueva que la
 * soportada.
 */
export function migrateEscena(doc: unknown, registry: Migration[] = MIGRATIONS, target: string = SCHEMA_VERSION): MigrationResult {
  const desde = versionOf(doc);
  if (compareSchemaVersions(desde, target) > 0) {
    throw new Error(`La escena usa la versión ${desde}, más nueva que la soportada (${target}). Actualiza Croquis.`);
  }
  let current = structuredClone(doc) as Record<string, unknown>;
  let version = desde;
  const aplicadas: string[] = [];
  while (compareSchemaVersions(version, target) < 0) {
    const step = registry.find((m) => m.desde === version);
    if (!step) throw new Error(`No hay migración registrada desde la versión ${version}.`);
    current = step.aplicar(structuredClone(current));
    const meta = (current.meta ?? {}) as Record<string, unknown>;
    current.meta = { ...meta, version_esquema: step.hasta };
    aplicadas.push(`${step.desde}→${step.hasta}`);
    version = step.hasta;
  }
  return { doc: current, aplicadas, desde, hasta: version };
}
