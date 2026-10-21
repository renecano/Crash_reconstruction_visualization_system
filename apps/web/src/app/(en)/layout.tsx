import type { ReactNode } from "react";
import { Documento } from "@/components/sitio/documento";
import "../globals.css";

export { viewport } from "@/components/sitio/documento";

export default function RootEnglish({ children }: { children: ReactNode }) {
  return <Documento lang="en">{children}</Documento>;
}
