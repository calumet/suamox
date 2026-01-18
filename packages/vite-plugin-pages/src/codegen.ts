import type { RouteRecord } from './types.js';

/**
 * Generate the virtual module code for routes
 */
export function generateRoutesModule(routes: RouteRecord[]): string {
  const imports: string[] = [];
  const routeObjects: string[] = [];

  routes.forEach((route, index) => {
    const importName = `Page${index}`;

    // Generate import statement
    // Use forward slashes for Windows compatibility in import paths
    const importPath = route.filePath.replace(/\\/g, '/');
    imports.push(`import ${importName} from '${importPath}';`);

    // Generate route object
    const routeObj = `  {
    path: ${JSON.stringify(route.path)},
    component: ${importName},
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
