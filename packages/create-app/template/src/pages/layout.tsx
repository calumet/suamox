import type { ReactNode } from "react";

import "../styles/global.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ minHeight: "100vh", margin: "0 auto", maxWidth: "720px", padding: "2.5rem 2rem" }}
    >
      <main>{children}</main>
    </div>
  );
}
