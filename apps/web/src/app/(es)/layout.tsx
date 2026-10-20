import type { ReactNode } from "react";
import { Documento } from "@/components/sitio/documento";
import "../globals.css";

export { viewport } from "@/components/sitio/documento";

export default function RaizEspanol({ children }: { children: ReactNode }) {
  return <Documento lang="es">{children}</Documento>;
}
