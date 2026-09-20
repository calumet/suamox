import type { ReactNode } from "react";

// El CSS global va aqui y no en `layout.tsx`: el root envuelve siempre, y una
// pagina con `export const layout = false` se sale de los layouts pero no de el
import "../styles/global.css";

export default function Root({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
