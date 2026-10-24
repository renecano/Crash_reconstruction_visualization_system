/**
 * R11 (ADR 0085): el video cinematográfico en la laptop, con renders cortos y de baja resolución,
 * para comprobar que la escena de «Exportar a Blender» se arma y se renderiza con la leyenda, y
 * cuánta memoria usa. El render final en calidad completa es en la computadora de la demo.
 *
 * Para cada render: lanza Blender con `tools/blender/croquis_render.py` y, cada 250 ms, anota la
 * memoria de Blender (conjunto de trabajo de sus procesos) y la de toda la máquina. El criterio de
 * René: Blender no pasa del 70 % de la RAM. También se anota el uso de la máquina antes de empezar
 * (lo que ocupan los demás programas) y su máximo durante el render.
 *
 * La laptop se mantiene despierta durante la medición (`SetThreadExecutionState` desde un PowerShell
 * que se cierra al final; Windows vuelve solo a su comportamiento normal): la primera medición de
 * Cycles se detuvo 96 min a la mitad, con el equipo suspendido.
 *
 * Uso (Windows, con Blender 5.2 en D:\dev-cache\tools o en CROQUIS_BLENDER):
 *   node eval/r11_render_laptop.mjs <escena.glb> <carpeta de salida>
 * Escribe eval/results/r11_render_laptop.json.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FFPROBE } from "../demo/video/comun.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const BLENDER =
  process.env.CROQUIS_BLENDER ?? "D:/dev-cache/tools/blender/blender-5.2.3-windows-x64/blender.exe";
const SCRIPT = join(RAIZ, "tools/blender/croquis_render.py");
const LIMITE = 0.7;

const [glb, salida] = process.argv.slice(2);
if (!glb || !salida) {
  console.error("Uso: node eval/r11_render_laptop.mjs <escena.glb> <carpeta de salida>");
  process.exit(2);
}
mkdirSync(salida, { recursive: true });

/** Los renders de prueba: cortos y de baja resolución, uno por motor. */
const RENDERS = [
  {
    id: "eevee_480p_2s",
    args: ["--motor", "eevee", "--resolucion", "480x270", "--muestras", "16"],
    tramo: ["-0.5", "1.5"],
  },
  {
    id: "cycles_320p_10cuadros",
    args: ["--motor", "cycles", "--resolucion", "320x180", "--muestras", "8"],
    tramo: ["0", "0.3"],
  },
];

/** Un PowerShell que imprime «MB_blender libre_KB total_KB» cada 250 ms. */
function monitor() {
  const ps = spawn(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "while ($true) { $o = Get-CimInstance Win32_OperatingSystem; " +
        "$b = (Get-Process blender -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum; " +
        "'{0} {1} {2}' -f [int]($b/1MB), $o.FreePhysicalMemory, $o.TotalVisibleMemorySize; " +
        "Start-Sleep -Milliseconds 250 }",
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  const muestras = [];
  let resto = "";
  ps.stdout.on("data", (d) => {
    resto += d.toString();
    const lineas = resto.split(/\r?\n/);
    resto = lineas.pop();
    for (const l of lineas) {
      const [mb, libre, total] = l.trim().split(/\s+/).map(Number);
      if (Number.isFinite(total))
        muestras.push({ mb, usoMaquina: 1 - libre / total, totalKb: total });
    }
  });
  return { ps, muestras };
}

function uso() {
  const out = execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    "$o = Get-CimInstance Win32_OperatingSystem; '{0} {1}' -f $o.FreePhysicalMemory, $o.TotalVisibleMemorySize",
  ]).toString();
  const [libre, total] = out.trim().split(/\s+/).map(Number);
  return { uso: 1 - libre / total, totalGb: total / 1024 / 1024 };
}

function sondear(archivo) {
  const j = JSON.parse(
    execFileSync(FFPROBE, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_frames",
      "-show_entries",
      "stream=width,height,codec_name,nb_read_frames,r_frame_rate",
      "-show_entries",
      "format=duration,size",
      "-of",
      "json",
      archivo,
    ]).toString(),
  );
  const s = j.streams[0];
  return {
    codec: s.codec_name,
    ancho: s.width,
    alto: s.height,
    cuadros: Number(s.nb_read_frames),
    fps: s.r_frame_rate,
    duracion_s: Number(Number(j.format.duration).toFixed(3)),
    bytes: Number(j.format.size),
  };
}

// ES_CONTINUOUS | ES_SYSTEM_REQUIRED mientras vive este PowerShell.
const despierta = spawn(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    "$f = Add-Type -Name D -Namespace W -PassThru -MemberDefinition " +
      "'[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint e);'; " +
      "while ($true) { [void]$f::SetThreadExecutionState(0x80000001); Start-Sleep -Seconds 30 }",
  ],
  { stdio: "ignore" },
);
const base = uso();
const resultados = [];
for (const r of RENDERS) {
  const video = join(salida, `${r.id}.mp4`);
  const antes = uso();
  const { ps, muestras } = monitor();
  await new Promise((ok) => setTimeout(ok, 1000));
  const t0 = Date.now();
  const log = [];
  const codigo = await new Promise((ok) => {
    const b = spawn(BLENDER, [
      "-b",
      "--factory-startup",
      "-P",
      SCRIPT,
      "--",
      glb,
      ...r.args,
      "--desde",
      r.tramo[0],
      "--hasta",
      r.tramo[1],
      "--salida",
      video,
    ]);
    b.stdout.on("data", (d) => log.push(d.toString()));
    b.stderr.on("data", (d) => log.push(d.toString()));
    b.on("close", ok);
  });
  const segundos = (Date.now() - t0) / 1000;
  await new Promise((ok) => setTimeout(ok, 500));
  ps.kill();
  const texto = log.join("");
  writeFileSync(join(salida, `${r.id}.log`), texto);
  if (codigo !== 0) throw new Error(`${r.id}: Blender terminó con ${codigo} (ver ${r.id}.log)`);
  const picoMb = Math.max(0, ...muestras.map((m) => m.mb));
  const totalMb = muestras[0].totalKb / 1024;
  // Blender informa su pico de memoria en cada cuadro («Peak 123.45M»).
  const picos = [...texto.matchAll(/Peak\s+([\d.]+)M/g)].map((m) => Number(m[1]));
  resultados.push({
    id: r.id,
    argumentos: [...r.args, "--desde", r.tramo[0], "--hasta", r.tramo[1]],
    segundos_de_render: Number(segundos.toFixed(1)),
    video: sondear(video),
    memoria: {
      blender_pico_mb: picoMb,
      blender_pico_fraccion_ram: Number((picoMb / totalMb).toFixed(3)),
      blender_pico_informado_mb: picos.length ? Math.max(...picos) : null,
      maquina_antes_fraccion: Number(antes.uso.toFixed(3)),
      maquina_pico_fraccion: Number(Math.max(...muestras.map((m) => m.usoMaquina)).toFixed(3)),
      muestras: muestras.length,
    },
    cumple_limite_blender: picoMb / totalMb <= LIMITE,
  });
  console.log(JSON.stringify(resultados.at(-1)));
}

despierta.kill();
const resultado = {
  fecha: new Date().toISOString(),
  equipo_despierto_durante_la_medicion: true,
  blender: execFileSync(BLENDER, ["-b", "--factory-startup", "--version"])
    .toString()
    .split(/\r?\n/)[0]
    .trim(),
  escena: {
    archivo: glb.split(/[\\/]/).pop(),
    sha256: createHash("sha256").update(readFileSync(glb)).digest("hex"),
    bytes: readFileSync(glb).length,
  },
  ram_total_gb: Number(base.totalGb.toFixed(2)),
  limite_blender_fraccion_ram: LIMITE,
  renders: resultados,
};
writeFileSync(
  join(RAIZ, "eval/results/r11_render_laptop.json"),
  `${JSON.stringify(resultado, null, 2)}\n`,
);
console.log("eval/results/r11_render_laptop.json");
