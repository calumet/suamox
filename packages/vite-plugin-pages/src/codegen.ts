import type { RouteRecord } from './types.js';

/**
 * Generate the virtual module code for routes
 */
export function generateRoutesModule(routes: RouteRecord[]): string {
  const imports: string[] = [];
  const routeObjects: string[] = [];

  routes.forEach((route, index) => {
    const importName = `Page${index}`;
    const moduleName = `_module${index}`;
    const importPath = route.filePath.replace(/\\/g, '/');
    const layoutNames: string[] = [];

    // Import the entire module as namespace to prevent tree-shaking
    imports.push(`import * as ${moduleName} from '${importPath}';`);
    imports.push(`const ${importName} = ${moduleName}.default;`);

    if (route.layouts) {
      route.layouts.forEach((layoutPath, layoutIndex) => {
        const layoutModuleName = `_layoutModule${index}_${layoutIndex}`;
        const layoutName = `Layout${index}_${layoutIndex}`;
        const layoutImportPath = layoutPath.replace(/\\/g, '/');

        imports.push(`import * as ${layoutModuleName} from '${layoutImportPath}';`);
        imports.push(`const ${layoutName} = ${layoutModuleName}.default;`);
        layoutNames.push(layoutName);
      });
    }

    // Determine loader value - access from module namespace
    const loaderValue = route.hasLoader ? `${moduleName}.loader` : 'undefined';
    const layoutsValue = layoutNames.length > 0 ? `[${layoutNames.join(', ')}]` : '[]';

    // Generate route object
    const routeObj = `  {
    path: ${JSON.stringify(route.path)},
    component: ${importName},
    layouts: ${layoutsValue},
    loader: ${loaderValue},
    filePath: ${JSON.stringify(route.filePath)},
    params: ${JSON.stringify(route.params)},
    isCatchAll: ${route.isCatchAll},
    isIndex: ${route.isIndex},
    priority: ${route.priority}
  }`;

    routeObjects.push(routeObj);
  });

  return `${imports.join('\n')}

export const routes = [
${routeObjects.join(',\n')}
];

export default routes;
`;
}
