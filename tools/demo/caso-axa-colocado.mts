/**
 * El caso de AXA (A2010930) colocado como lo reconstruyen la app y el video de R11
 * (`apps/web/src/lib/axa-reconstruccion.ts`), en el formato con que la app guarda un caso en el
 * navegador (`casoParaGuardar`). Sirve para abrir ese caso en producción sin colocarlo a mano y
 * revisar los pasos que dependen de la reconstrucción (`verificar-r12a.mjs`).
 *
 *   pnpm --filter @croquis/cesvi exec tsx ../../tools/demo/caso-axa-colocado.mts <salida.json>
 */
import { writeFileSync } from "node:fs";
import { expedienteAxaReconstruccion } from "../../apps/web/src/lib/axa-reconstruccion.ts";
import { casoAxa } from "../../apps/web/src/lib/caso-axa.ts";
import { casoParaGuardar } from "../../apps/web/src/lib/caso-guardado.ts";

const c = casoAxa();
const archivo = casoParaGuardar({
  narracion: c.narracion,
  escena: c.escena!,
  expediente: expedienteAxaReconstruccion(),
  validacion: null,
  titulo: `${c.titulo} (colocado como en la app)`,
  reporte: c.reporte,
});
writeFileSync(process.argv[2]!, JSON.stringify(archivo));
console.log("escrito", process.argv[2], archivo.expediente.vehiculos.length, "vehículos");
