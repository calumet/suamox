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

    // Import the entire module as namespace to prevent tree-shaking
    imports.push(`import * as ${moduleName} from '${importPath}';`);
    imports.push(`const ${importName} = ${moduleName}.default;`);

    // Determine loader value - access from module namespace
    const loaderValue = route.hasLoader ? `${moduleName}.loader` : 'undefined';

    // Generate route object
    const routeObj = `  {
    path: ${JSON.stringify(route.path)},
    component: ${importName},
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
