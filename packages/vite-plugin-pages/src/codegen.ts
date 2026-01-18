import type { RouteRecord } from './types.js';

/**
 * Generate the virtual module code for routes
 */
export function generateRoutesModule(routes: RouteRecord[]): string {
  const declarations: string[] = [];
  const routeObjects: string[] = [];

  routes.forEach((route, index) => {
    const loadPageName = `loadPage${index}`;
    const loadLayoutsName = `loadLayouts${index}`;
    const loadRouteName = `loadRoute${index}`;
    const importPath = route.filePath.replace(/\\/g, '/');
    const layoutLoadCalls: string[] = [];

    declarations.push(`const ${loadPageName} = () => import('${importPath}');`);

    if (route.layouts) {
      route.layouts.forEach((layoutPath, layoutIndex) => {
        const layoutLoaderName = `loadLayout${index}_${layoutIndex}`;
        const layoutImportPath = layoutPath.replace(/\\/g, '/');

        declarations.push(`const ${layoutLoaderName} = () => import('${layoutImportPath}');`);
        layoutLoadCalls.push(`${layoutLoaderName}()`);
      });
    }

    const layoutsValue =
      layoutLoadCalls.length > 0
        ? `Promise.all([${layoutLoadCalls.join(', ')}]).then((modules) => modules.map((mod) => mod.default))`
        : 'Promise.resolve([])';

    declarations.push(`const ${loadLayoutsName} = () => ${layoutsValue};`);

    declarations.push(`const ${loadRouteName} = async () => {
  const _module = await ${loadPageName}();
  const _layouts = await ${loadLayoutsName}();
  return {
    component: _module.default,
    loader: _module.loader,
    getStaticPaths: _module.getStaticPaths,
    prerender: _module.prerender === true,
    csr: _module.csr === true,
    layouts: _layouts
  };
};`);

    // Generate route object
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

  return `${declarations.join('\n')}

export const routes = [
${routeObjects.join(',\n')}
];

export default routes;
`;
}
