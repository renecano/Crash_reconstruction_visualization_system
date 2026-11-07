/**
 * Genera los tipos C# del paquete caso-3d para el visor Unity, con quicktype, en
 * `apps/visor-unity/Assets/Croquis/Generated/`. No se editan a mano y CI revisa que estén al día.
 *
 * quicktype no resuelve bien los `$ref` a otros archivos, así que primero se juntan los tres esquemas
 * en uno solo, y esto solo vive en memoria: las fuentes siguen siendo los esquemas de siempre. Si
 * dos esquemas definen el mismo nombre, se le pone prefijo al del resultado.
 *
 * Uso: `pnpm --filter @croquis/scene-schema generate` · `--check` falla si no están al día.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Json = Record<string, unknown>;
const AQUI = dirname(fileURLToPath(import.meta.url));
const PAQ = resolve(AQUI, "..");
const SALIDA = resolve(PAQ, "../../apps/visor-unity/Assets/Croquis/Generated/Caso3d.cs");
const leer = (f: string) => JSON.parse(readFileSync(join(PAQ, f), "utf8")) as Json;

/** Cambia cada `$ref` según `cambio`, en todo el documento. */
function conRefs(x: unknown, cambio: (r: string) => string): unknown {
  if (Array.isArray(x)) return x.map((v) => conRefs(v, cambio));
  if (x && typeof x === "object") {
    return Object.fromEntries(
      Object.entries(x).map(([k, v]) => [
        k,
        k === "$ref" && typeof v === "string" ? cambio(v) : conRefs(v, cambio),
      ]),
    );
  }
  return x;
}

export function esquemaUnido(): Json {
  const caso = leer("caso3d.schema.json");
  const escena = leer("escena.schema.json");
  const resultado = leer("resultado.schema.json");
  const defs: Record<string, unknown> = {};
  const prefijo = (nombre: string, otros: Json) =>
    nombre in ((otros.$defs ?? {}) as Json) ? `Resultado${nombre}` : nombre;
  const local = (nombre: (n: string) => string) => (r: string) => {
    if (!r.startsWith("#/$defs/")) throw new Error(`$ref no local: ${r}`);
    return `#/$defs/${nombre(r.slice("#/$defs/".length))}`;
  };
  const deEscena = (n: string) => n;
  const deResultado = (n: string) => prefijo(n, escena);
  for (const [n, d] of Object.entries((escena.$defs ?? {}) as Json)) {
    defs[deEscena(n)] = conRefs(d, local(deEscena));
  }
  for (const [n, d] of Object.entries((resultado.$defs ?? {}) as Json)) {
    defs[deResultado(n)] = conRefs(d, local(deResultado));
  }
  for (const [n, d] of Object.entries((caso.$defs ?? {}) as Json)) defs[n] = d;
  const raiz = (s: Json, cambio: (r: string) => string) => {
    const resto = { ...s };
    for (const k of ["$defs", "$schema", "$id"]) delete resto[k];
    return conRefs(resto, cambio);
  };
  defs.EscenaSpec = raiz(escena, local(deEscena));
  defs.Resultado = raiz(resultado, local(deResultado));
  const resto = { ...caso };
  for (const k of ["$defs", "$id"]) delete resto[k];
  return {
    ...(conRefs(resto, (r) =>
      r.includes("/escena")
        ? "#/$defs/EscenaSpec"
        : r.includes("/resultado/")
          ? "#/$defs/Resultado"
          : r,
    ) as Json),
    $defs: defs,
  };
}

export function generarCsharp(): string {
  const dir = mkdtempSync(join(tmpdir(), "croquis-csharp-"));
  try {
    const unido = join(dir, "Caso3D.schema.json");
    const salida = join(dir, "Caso3d.cs");
    writeFileSync(unido, JSON.stringify(esquemaUnido()), "utf8");
    const bin = resolve(PAQ, "node_modules/quicktype/dist/index.js");
    execFileSync(
      process.execPath,
      [
        bin,
        "--src-lang",
        "schema",
        "--src",
        unido,
        "--top-level",
        "Caso3D",
        "--lang",
        "cs",
        "--namespace",
        "Croquis.Generated",
        "--framework",
        "NewtonSoft",
        "--array-type",
        "array",
        "--number-type",
        "double",
        "--csharp-version",
        "6",
        "--features",
        "complete",
        "--no-check-required",
        "--out",
        salida,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    const cuerpo = readFileSync(salida, "utf8").replaceAll("\r\n", "\n");
    return `// Generado por packages/scene-schema/scripts/generate-csharp.ts a partir de caso3d.schema.json.\n// NO EDITAR A MANO. Regenera con \`pnpm --filter @croquis/scene-schema generate\`.\n${cuerpo}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const codigo = generarCsharp();
  if (process.argv.includes("--check")) {
    let actual = "";
    try {
      actual = readFileSync(SALIDA, "utf8").replaceAll("\r\n", "\n");
    } catch {
      /* no existe */
    }
    if (actual !== codigo) {
      console.error(
        `Desactualizado: ${SALIDA}. Corre \`pnpm --filter @croquis/scene-schema generate\`.`,
      );
      process.exitCode = 1;
    } else console.log("C# generado al día: Caso3d.cs");
  } else {
    mkdirSync(dirname(SALIDA), { recursive: true });
    writeFileSync(SALIDA, codigo, "utf8");
    console.log(`Escrito ${SALIDA}`);
  }
}
