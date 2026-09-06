import { createHash } from "node:crypto";

/**
 * Hash de un script inline en el formato que espera una CSP.
 *
 * Vive aparte de `index.ts` porque ese modulo tambien se carga en el navegador y no
 * puede importar `node:crypto`.
 */
export const hashInlineScript = (code: string): string =>
  `sha256-${createHash("sha256").update(code, "utf8").digest("base64")}`;

/** Hasher listo para pasar a `generateHTML({ csp })` */
export const cspHasher = { hash: hashInlineScript };
