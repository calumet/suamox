import type { RouteRecord } from "./types.js";

export type DefaultPageMode = "ssr" | "ssg" | "csr";

export interface GenerateRoutesOptions {
  defaultMode?: DefaultPageMode;
  base?: string;
}

/**
 * Genera el código del módulo virtual de rutas
 */
export function generateRoutesModule(
  routes: RouteRecord[],
  options: GenerateRoutesOptions = {},
): string {
  const { defaultMode = "ssr", base = "/" } = options;
  const defaultPrerender = defaultMode === "ssg";
  const defaultCsr = defaultMode === "csr";
  const declarations: string[] = [];
  const routeObjects: string[] = [];

  routes.forEach((route, index) => {
    const loadPageName = `loadPage${index}`;
    const loadLayoutsName = `loadLayouts${index}`;
    const loadRouteName = `loadRoute${index}`;
    const importPath = route.filePath.replace(/\\/g, "/");
    const layoutLoadCalls: string[] = [];

    declarations.push(`const ${loadPageName} = () => import('${importPath}');`);

    if (route.layouts) {
      route.layouts.forEach((layoutPath, layoutIndex) => {
        const layoutLoaderName = `loadLayout${index}_${layoutIndex}`;
        const layoutImportPath = layoutPath.replace(/\\/g, "/");

        declarations.push(`const ${layoutLoaderName} = () => import('${layoutImportPath}');`);
        layoutLoadCalls.push(`${layoutLoaderName}()`);
      });
    }

    const layoutsValue =
      layoutLoadCalls.length > 0
        ? `Promise.all([${layoutLoadCalls.join(", ")}]).then((modules) => modules.map((mod) => mod.default))`
        : "Promise.resolve([])";

    declarations.push(`const ${loadLayoutsName} = () => ${layoutsValue};`);

    declarations.push(`const ${loadRouteName} = async () => {
  const _module = await ${loadPageName}();
  const _layouts = await ${loadLayoutsName}();
  const _hasPrerender = 'prerender' in _module;
  const _hasCsr = 'csr' in _module;
  const _prerender = _hasPrerender ? _module.prerender === true : ${defaultPrerender};
  const _csr = _hasCsr ? _module.csr === true : ${defaultCsr ? "!_prerender" : "false"};
  return {
    component: _module.default,
    loader: _module.loader,
    getStaticPaths: _module.getStaticPaths,
    prerender: _prerender,
    csr: _csr,
    layouts: _layouts
  };
};`);

    // Generar objeto de ruta
    const routeObj = `  {
    path: ${JSON.stringify(route.path)},
    load: ${loadRouteName},
    filePath: ${JSON.stringify(route.filePath)},
    params: ${JSON.stringify(route.params)},
    isCatchAll: ${route.isCatchAll},
    isIndex: ${route.isIndex},
    priority: ${route.priority}
  }`;

    routeObjects.push(routeObj);
  });

  const normalizedBase = base.replace(/\/+$/, "") || "/";

  return `${declarations.join("\n")}

export const routes = [
${routeObjects.join(",\n")}
];

export const base = ${JSON.stringify(normalizedBase)};

export default routes;
`;
}
