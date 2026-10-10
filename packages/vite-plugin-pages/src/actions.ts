import { createHmac } from "node:crypto";
import { resolve } from "node:path";

import { parseSync, type ESTree } from "vite";

export const ACTIONS_CLIENT_MODULE_ID = "virtual:pages/actions-client";

/** Una acción por export. `file` es relativo a la raíz, para que el id no dependa de la máquina */
export interface ActionEntry {
  file: string;
  name: string;
}

/**
 * Sin distinguir mayúsculas: en macOS y Windows `../X.Actions` resuelve al mismo archivo, y
 * un patrón exacto lo dejaría pasar entero al bundle del navegador
 */
export function isActionsFile(path: string): boolean {
  return /\.actions\.[cm]?[jt]sx?$/i.test(path);
}

/**
 * Firmado con la clave del build: sin ella, quien adivine la ruta y el nombre calcula el id.
 * La URL tampoco deja ver cómo está organizado el código
 */
export function actionId(file: string, name: string, key: string): string {
  return createHmac("sha256", key).update(`${file}#${name}`).digest("hex").slice(0, 16);
}

type Statement = ESTree.Program["body"][number];

const isFunctionNode = (node: unknown): boolean => {
  const type = (node as { type?: string } | null | undefined)?.type;
  return (
    type === "FunctionDeclaration" ||
    type === "FunctionExpression" ||
    type === "ArrowFunctionExpression"
  );
};

/** Nombres de nivel superior que son funciones declaradas en el propio archivo */
function localFunctions(body: Statement[]): Set<string> {
  const names = new Set<string>();
  for (const statement of body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type === "FunctionDeclaration" && declaration.id) {
      names.add(declaration.id.name);
    }
    if (declaration?.type === "VariableDeclaration") {
      for (const declarator of declaration.declarations) {
        if (declarator.id.type === "Identifier" && isFunctionNode(declarator.init)) {
          names.add(declarator.id.name);
        }
      }
    }
  }
  return names;
}

/**
 * Cada export es un endpoint público, así que solo vale una función declarada aquí. Un
 * reexport expondría sin querer lo que otro módulo exporta para su propio uso.
 * Acepta el fuente en TS o ya en JS.
 */
export function collectActionExports(code: string, filePath: string): string[] {
  const result = parseSync(filePath, code);
  if (result.errors.length > 0) {
    throw new Error(
      `[suamox:pages] Failed to parse actions file "${filePath}": ` +
        (result.errors[0]?.message ?? "unknown parse error"),
    );
  }

  const fail = (detail: string): never => {
    throw new Error(
      `[suamox:pages] "${filePath}" ${detail}. ` +
        `Every export of an actions file must be a function declared in it.`,
    );
  };

  const body = result.program.body;
  const functions = localFunctions(body);
  const names: string[] = [];

  for (const statement of body) {
    switch (statement.type) {
      case "ExportAllDeclaration":
        fail("re-exports a whole module");
        break;

      case "ExportDefaultDeclaration": {
        const declaration = statement.declaration;
        const isFunction =
          isFunctionNode(declaration) ||
          (declaration.type === "Identifier" && functions.has(declaration.name));
        if (!isFunction) fail("has a default export that is not a function");
        names.push("default");
        break;
      }

      case "ExportNamedDeclaration": {
        if (statement.exportKind === "type") break;
        if (statement.source) fail(`re-exports from "${String(statement.source.value)}"`);

        const declaration = statement.declaration;
        if (!declaration) {
          for (const specifier of statement.specifiers) {
            if (specifier.exportKind === "type") continue;
            const local = specifier.local.type === "Identifier" ? specifier.local.name : "";
            const exported =
              specifier.exported.type === "Identifier"
                ? specifier.exported.name
                : String(specifier.exported.value);
            if (!functions.has(local)) fail(`exports "${exported}", which is not a function`);
            names.push(exported);
          }
          break;
        }

        if (declaration.type === "FunctionDeclaration" && declaration.id) {
          names.push(declaration.id.name);
        } else if (declaration.type === "VariableDeclaration") {
          for (const declarator of declaration.declarations) {
            const name = declarator.id.type === "Identifier" ? declarator.id.name : "";
            if (!name || !isFunctionNode(declarator.init)) {
              fail(`exports "${name || "a destructured binding"}", which is not a function`);
            }
            names.push(name);
          }
        } else if (
          declaration.type !== "TSTypeAliasDeclaration" &&
          declaration.type !== "TSInterfaceDeclaration"
        ) {
          fail(`exports a ${declaration.type}`);
        }
        break;
      }

      default:
        break;
    }
  }
  return names;
}

/** El módulo que recibe el navegador en lugar del original: ni una línea del servidor */
export function generateActionStubs(actions: ReadonlyArray<{ id: string; name: string }>): string {
  const lines = [`import { createAction } from ${JSON.stringify(ACTIONS_CLIENT_MODULE_ID)};`];
  actions.forEach(({ id, name }, index) => {
    // `export { a as "x-y" }` es válido: un nombre que no es identificador va entre comillas
    const exported = /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
    // Puro para que el bundler quite la acción que nadie importa, y con ella su id
    lines.push(`const __action${index} = /* @__PURE__ */ createAction(${JSON.stringify(id)});`);
    lines.push(`export { __action${index} as ${exported} };`);
  });
  return lines.join("\n") + "\n";
}

/** Tabla del bundle del servidor. Cada acción se carga al pedirla, como las páginas */
export function generateActionsCode(actions: Record<string, ActionEntry>, root: string): string {
  const entries = Object.entries(actions).map(([id, { file, name }]) => {
    const path = resolve(root, file).replace(/\\/g, "/");
    return (
      `  ${JSON.stringify(id)}: { file: ${JSON.stringify(file)}, name: ${JSON.stringify(name)}, ` +
      `load: () => import(${JSON.stringify(path)}).then((m) => m[${JSON.stringify(name)}]) },`
    );
  });
  return `\nexport const actions = {\n${entries.join("\n")}\n};\n`;
}

/** Los ids que sobrevivieron al tree-shaking: lo que el bundle del navegador puede llamar */
export function referencedActionIds(code: string, ids: Iterable<string>): Set<string> {
  const found = new Set<string>();
  for (const id of ids) {
    if (code.includes(id)) found.add(id);
  }
  return found;
}
