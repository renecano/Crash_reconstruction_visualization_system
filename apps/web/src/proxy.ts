/**
 * Protección de acceso del prototipo para CESVI (docs/cesvi/PROTOTIPO.md: es un caso real). Pide
 * usuario y clave (HTTP Basic) en `/cesvi` y lo que cuelgue de ahí. Las credenciales viven en las
 * variables de entorno `CROQUIS_CESVI_USUARIO` y `CROQUIS_CESVI_CLAVE` (ADR 0049).
 *
 * Sin clave configurada: en Vercel la página no abre (falla cerrada, nunca queda pública por
 * descuido); en desarrollo y en las pruebas abre sin pedir nada.
 */
import { NextResponse, type NextRequest } from "next/server";

/** Compara sin salir antes al primer carácter distinto. */
function iguales(a: string, b: string): boolean {
  let diferencia = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diferencia |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diferencia === 0;
}

function credenciales(request: NextRequest): [string, string] | null {
  const encabezado = request.headers.get("authorization");
  if (!encabezado?.startsWith("Basic ")) return null;
  try {
    const texto = atob(encabezado.slice(6));
    const i = texto.indexOf(":");
    return i < 0 ? null : [texto.slice(0, i), texto.slice(i + 1)];
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const usuario = process.env.CROQUIS_CESVI_USUARIO ?? "cesvi";
  const clave = process.env.CROQUIS_CESVI_CLAVE;
  if (!clave) {
    if (process.env.VERCEL) {
      return new NextResponse("El acceso al prototipo para CESVI no está configurado.", {
        status: 503,
      });
    }
    return NextResponse.next();
  }
  const dadas = credenciales(request);
  if (dadas && iguales(dadas[0], usuario) && iguales(dadas[1], clave)) {
    return NextResponse.next();
  }
  return new NextResponse("Se necesita usuario y clave para ver el prototipo para CESVI.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Croquis para CESVI", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/cesvi", "/cesvi/:path*"],
};
