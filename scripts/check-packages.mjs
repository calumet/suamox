// Dos invariantes que solo se ven instalando desde el registro, que es lo que
// no hace nadie en CI. Los dos fallos que motivan esto salieron de una app real.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packagesDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "packages");
const read = (path) => JSON.parse(readFileSync(path, "utf-8"));

const manifests = readdirSync(packagesDir).map((name) =>
  read(join(packagesDir, name, "package.json")),
);
const versions = new Map(manifests.map((m) => [m.name, m.version]));
const problems = [];

// Un `@calumet/*` propio en `dependencies` se instala como copia aparte en
// cuanto los rangos divergen, y entonces corren dos runtimes a la vez: dos
// formatos de serializacion, o dos contextos de React que no se ven.
for (const manifest of manifests) {
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (versions.has(name)) {
      problems.push(`${manifest.name}: "${name}" va en peerDependencies, no en dependencies`);
    }
  }
}

// El template se publica con rangos fijos, asi que se queda viejo en silencio
// en cuanto un paquete cruza una minor: en `0.x` el caret no la cruza.
const template = read(join(packagesDir, "create-app", "template", "package.json"));
for (const field of ["dependencies", "devDependencies"]) {
  for (const [name, range] of Object.entries(template[field] ?? {})) {
    const version = versions.get(name);
    if (version && range !== `^${version}`) {
      problems.push(`template: "${name}" pide ${range} y la version publicada es ${version}`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.map((line) => `  ${line}`).join("\n"));
  process.exit(1);
}
