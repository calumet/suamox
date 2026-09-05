import MagicString from "magic-string";
import type { ESTree } from "vite";

/** Exports que son seguros para incluir en el bundle del cliente */
export const CLIENT_SAFE_EXPORTS = new Set(["default", "prerender", "csr"]);

interface AstNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

/**
 * Declaracion de nivel superior que se puede borrar si nada viva la referencia.
 * `exportKeyword` es el rango de la palabra `export` que se quita cuando la
 * declaracion sobrevive porque otro codigo del cliente si la usa.
 */
interface Candidate {
  names: string[];
  refs: Set<string>;
  start: number;
  end: number;
  exportKeyword?: [number, number];
  alive: boolean;
}

export interface StripServerExportsResult {
  code: string;
  map: ReturnType<MagicString["generateMap"]>;
}

/**
 * Borra del modulo los exports server-only (`loader`, `getStaticPaths`, ...) y
 * despues poda las declaraciones e imports de nivel superior que se quedaron sin
 * usar. A diferencia de reexportar desde el archivo original, esto saca del
 * bundle del cliente los modulos importados aunque tengan efectos de nivel de
 * modulo, que Rollup no puede podar por su cuenta.
 *
 * @returns `null` si el modulo no exporta nada server-only
 */
export function stripServerExports(
  code: string,
  program: ESTree.Program,
  filePath: string,
): StripServerExportsResult | null {
  const candidates: Candidate[] = [];
  const rootRefs = new Set<string>();
  const rewrites: Array<{ start: number; end: number; text: string | null }> = [];
  const reExportedNames: string[] = [];
  let hasServerExport = false;
  let remainingExports = 0;

  const keepAsRoot = (node: unknown): void => {
    collectRefs(node, rootRefs);
  };

  for (const statement of program.body) {
    switch (statement.type) {
      case "ImportDeclaration": {
        if (statement.importKind === "type") break;
        const names = statement.specifiers.map((specifier) => specifier.local.name);
        // Un import sin bindings (`import "./x"`) se escribio por su efecto
        if (names.length === 0) break;
        candidates.push({
          names,
          refs: new Set(),
          start: statement.start,
          end: statement.end,
          alive: false,
        });
        break;
      }

      case "ExportDefaultDeclaration":
        remainingExports++;
        keepAsRoot(statement.declaration);
        break;

      case "ExportAllDeclaration":
        remainingExports++;
        break;

      case "ExportNamedDeclaration": {
        if (statement.exportKind === "type") break;
        const handled = handleNamedExport(statement, code, {
          candidates,
          rewrites,
          reExportedNames,
          rootRefs,
        });
        hasServerExport ||= handled.hasServerExport;
        remainingExports += handled.remainingExports;
        break;
      }

      case "FunctionDeclaration":
      case "ClassDeclaration": {
        if (
          !statement.id ||
          (statement.type === "ClassDeclaration" && hasClassInitEffects(statement))
        ) {
          keepAsRoot(statement);
          break;
        }
        const refs = new Set<string>();
        collectRefs(statement, refs);
        candidates.push({
          names: [statement.id.name],
          refs,
          start: statement.start,
          end: statement.end,
          alive: false,
        });
        break;
      }

      case "VariableDeclaration": {
        if (!statement.declarations.every((declarator) => isSideEffectFree(declarator.init))) {
          keepAsRoot(statement);
          break;
        }
        const names: string[] = [];
        const refs = new Set<string>();
        for (const declarator of statement.declarations) {
          collectBoundNames(declarator.id, names);
          collectRefs(declarator, refs);
        }
        candidates.push({
          names,
          refs,
          start: statement.start,
          end: statement.end,
          alive: false,
        });
        break;
      }

      default:
        keepAsRoot(statement);
    }
  }

  if (!hasServerExport) return null;

  const live = new Set(rootRefs);
  for (const name of reExportedNames) live.add(name);

  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of candidates) {
      if (candidate.alive || !candidate.names.some((name) => live.has(name))) continue;
      candidate.alive = true;
      changed = true;
      for (const ref of candidate.refs) live.add(ref);
    }
  }

  const magic = new MagicString(code);

  for (const rewrite of rewrites) {
    if (rewrite.text === null) magic.remove(rewrite.start, rewrite.end);
    else magic.update(rewrite.start, rewrite.end, rewrite.text);
  }

  for (const candidate of candidates) {
    if (!candidate.alive) {
      magic.remove(candidate.start, candidate.end);
    } else if (candidate.exportKeyword) {
      magic.remove(candidate.exportKeyword[0], candidate.exportKeyword[1]);
    }
  }

  if (reExportedNames.length > 0) {
    magic.append(`\nexport { ${reExportedNames.join(", ")} };\n`);
    remainingExports += reExportedNames.length;
  }

  if (remainingExports === 0) {
    magic.append("\nexport {};\n");
  }

  return {
    code: magic.toString(),
    map: magic.generateMap({ source: filePath, hires: "boundary", includeContent: true }),
  };
}

interface NamedExportSink {
  candidates: Candidate[];
  rewrites: Array<{ start: number; end: number; text: string | null }>;
  reExportedNames: string[];
  rootRefs: Set<string>;
}

function handleNamedExport(
  statement: ESTree.ExportNamedDeclaration,
  code: string,
  sink: NamedExportSink,
): { hasServerExport: boolean; remainingExports: number } {
  const { declaration } = statement;

  if (declaration) {
    const names: string[] = [];
    if (declaration.type === "VariableDeclaration") {
      for (const declarator of declaration.declarations) collectBoundNames(declarator.id, names);
    } else if (
      declaration.type === "FunctionDeclaration" ||
      declaration.type === "ClassDeclaration"
    ) {
      if (declaration.id) names.push(declaration.id.name);
    } else {
      // Declaraciones TS que sobreviven al transform: no llegan al runtime
      return { hasServerExport: false, remainingExports: 0 };
    }

    const serverNames = names.filter((name) => !CLIENT_SAFE_EXPORTS.has(name));
    if (serverNames.length === 0) {
      collectRefs(declaration, sink.rootRefs);
      return { hasServerExport: false, remainingExports: names.length };
    }

    const exportKeyword: [number, number] = [statement.start, declaration.start];

    // Mezcla de exports seguros y server-only en una sola sentencia: se quita el
    // `export` y los seguros se reexportan al final del modulo.
    if (serverNames.length !== names.length) {
      sink.rewrites.push({ start: exportKeyword[0], end: exportKeyword[1], text: null });
      collectRefs(declaration, sink.rootRefs);
      for (const name of names) {
        if (CLIENT_SAFE_EXPORTS.has(name)) sink.reExportedNames.push(name);
      }
      return { hasServerExport: true, remainingExports: 0 };
    }

    const refs = new Set<string>();
    collectRefs(declaration, refs);
    sink.candidates.push({
      names,
      refs,
      start: statement.start,
      end: statement.end,
      exportKeyword,
      alive: false,
    });
    return { hasServerExport: true, remainingExports: 0 };
  }

  const kept: string[] = [];
  let hasServerExport = false;

  for (const specifier of statement.specifiers) {
    if (specifier.exportKind === "type") {
      kept.push(code.slice(specifier.start, specifier.end));
      continue;
    }
    if (CLIENT_SAFE_EXPORTS.has(exportedName(specifier))) {
      kept.push(code.slice(specifier.start, specifier.end));
      if (!statement.source) collectRefs(specifier.local, sink.rootRefs);
      continue;
    }
    hasServerExport = true;
  }

  if (!hasServerExport) {
    return { hasServerExport: false, remainingExports: statement.specifiers.length };
  }

  if (kept.length === 0) {
    sink.rewrites.push({ start: statement.start, end: statement.end, text: null });
    return { hasServerExport: true, remainingExports: 0 };
  }

  const tail = statement.source
    ? ` from ${code.slice(statement.source.start, statement.end)}`
    : ";";
  sink.rewrites.push({
    start: statement.start,
    end: statement.end,
    text: `export { ${kept.join(", ")} }${tail}`,
  });
  return { hasServerExport: true, remainingExports: kept.length };
}

function exportedName(specifier: ESTree.ExportSpecifier): string {
  const { exported } = specifier;
  return exported.type === "Identifier" ? exported.name : String(exported.value);
}

const SKIPPED_KEYS = new Set(["type", "start", "end", "range", "loc"]);

function isNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function nodeName(value: unknown): string | null {
  if (!isNode(value)) return null;
  return typeof value.name === "string" ? value.name : null;
}

/**
 * Junta los identificadores que el nodo *lee*. Sobre-aproxima a proposito: si
 * hay duda, el nombre cuenta como usado y su declaracion se conserva.
 */
function collectRefs(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, out);
    return;
  }
  if (!isNode(node)) return;

  switch (node.type) {
    case "Identifier":
    case "JSXIdentifier": {
      const name = nodeName(node);
      if (name) out.add(name);
      return;
    }

    case "PrivateIdentifier":
    case "TemplateElement":
    case "ImportDeclaration":
    case "BreakStatement":
    case "ContinueStatement":
      return;

    case "MemberExpression":
    case "JSXMemberExpression":
      collectRefs(node.object, out);
      if (node.computed === true) collectRefs(node.property, out);
      return;

    case "Property":
    case "PropertyDefinition":
    case "MethodDefinition":
    case "AccessorProperty":
      if (node.computed === true) collectRefs(node.key, out);
      collectRefs(node.value, out);
      return;

    case "JSXAttribute":
      collectRefs(node.value, out);
      return;

    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      collectPatternRefs(node.params, out);
      collectRefs(node.body, out);
      return;

    case "ClassDeclaration":
    case "ClassExpression":
      collectRefs(node.superClass, out);
      collectRefs(node.body, out);
      collectRefs(node.decorators, out);
      return;

    case "VariableDeclarator":
      collectPatternRefs(node.id, out);
      collectRefs(node.init, out);
      return;

    case "CatchClause":
      collectPatternRefs(node.param, out);
      collectRefs(node.body, out);
      return;

    case "LabeledStatement":
      collectRefs(node.body, out);
      return;

    default:
      for (const key of Object.keys(node)) {
        if (!SKIPPED_KEYS.has(key)) collectRefs(node[key], out);
      }
  }
}

/** Dentro de un patron de binding solo son lecturas las claves computadas y los valores por defecto */
function collectPatternRefs(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectPatternRefs(item, out);
    return;
  }
  if (!isNode(node)) return;

  switch (node.type) {
    case "Identifier":
      return;

    case "ObjectPattern":
      for (const property of asArray(node.properties)) {
        if (!isNode(property)) continue;
        if (property.type === "RestElement") {
          collectPatternRefs(property.argument, out);
          continue;
        }
        if (property.computed === true) collectRefs(property.key, out);
        collectPatternRefs(property.value, out);
      }
      return;

    case "ArrayPattern":
      collectPatternRefs(node.elements, out);
      return;

    case "AssignmentPattern":
      collectPatternRefs(node.left, out);
      collectRefs(node.right, out);
      return;

    case "RestElement":
      collectPatternRefs(node.argument, out);
      return;

    default:
      collectRefs(node, out);
  }
}

function collectBoundNames(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectBoundNames(item, out);
    return;
  }
  if (!isNode(node)) return;

  switch (node.type) {
    case "Identifier": {
      const name = nodeName(node);
      if (name) out.push(name);
      return;
    }
    case "ObjectPattern":
      for (const property of asArray(node.properties)) {
        if (!isNode(property)) continue;
        collectBoundNames(
          property.type === "RestElement" ? property.argument : property.value,
          out,
        );
      }
      return;
    case "ArrayPattern":
      collectBoundNames(node.elements, out);
      return;
    case "AssignmentPattern":
      collectBoundNames(node.left, out);
      return;
    case "RestElement":
      collectBoundNames(node.argument, out);
      return;
    default:
      return;
  }
}

/** Conservador: solo lo que no puede ejecutar codigo del usuario al evaluarse */
function isSideEffectFree(node: unknown): boolean {
  if (node === null || node === undefined) return true;
  if (!isNode(node)) return false;

  switch (node.type) {
    case "Literal":
    case "Identifier":
    case "ThisExpression":
    case "Super":
    case "MetaProperty":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      return true;

    case "ClassExpression":
      return !hasClassInitEffects(node);

    case "TemplateLiteral":
      return asArray(node.expressions).every(isSideEffectFree);

    case "ArrayExpression":
      return asArray(node.elements).every(
        (element) => element === null || (isNode(element) && isSideEffectFree(element)),
      );

    case "ObjectExpression":
      return asArray(node.properties).every(
        (property) =>
          isNode(property) &&
          property.type === "Property" &&
          (property.computed !== true || isSideEffectFree(property.key)) &&
          isSideEffectFree(property.value),
      );

    case "MemberExpression":
      return (
        isSideEffectFree(node.object) && (node.computed !== true || isSideEffectFree(node.property))
      );

    case "UnaryExpression":
      return node.operator !== "delete" && isSideEffectFree(node.argument);

    case "BinaryExpression":
    case "LogicalExpression":
      return isSideEffectFree(node.left) && isSideEffectFree(node.right);

    case "ConditionalExpression":
      return (
        isSideEffectFree(node.test) &&
        isSideEffectFree(node.consequent) &&
        isSideEffectFree(node.alternate)
      );

    case "SequenceExpression":
      return asArray(node.expressions).every(isSideEffectFree);

    case "ParenthesizedExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "TSInstantiationExpression":
      return isSideEffectFree(node.expression);

    default:
      return false;
  }
}

/** Un `static {}`, un campo estatico o un decorador corre al definirse la clase */
function hasClassInitEffects(node: unknown): boolean {
  if (!isNode(node)) return true;
  if (asArray(node.decorators).length > 0) return true;
  if (
    node.superClass !== null &&
    node.superClass !== undefined &&
    !isSideEffectFree(node.superClass)
  ) {
    return true;
  }

  const body = isNode(node.body) ? asArray(node.body.body) : [];
  return body.some((element) => {
    if (!isNode(element)) return false;
    if (element.type === "StaticBlock") return true;
    if (asArray(element.decorators).length > 0) return true;
    if (element.computed === true && !isSideEffectFree(element.key)) return true;
    return (
      element.static === true &&
      element.type === "PropertyDefinition" &&
      !isSideEffectFree(element.value)
    );
  });
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
