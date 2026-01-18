import type { RouteRecord } from './types.js';

/**
 * Generate the virtual module code for routes
 */
export function generateRoutesModule(routes: RouteRecord[]): string {
  const imports: string[] = [];
  const routeObjects: string[] = [];

  routes.forEach((route, index) => {
    const importName = `Page${index}`;
    const importPath = route.filePath.replace(/\\/g, '/');

    // Import default export (the component)
    imports.push(`import ${importName} from '${importPath}';`);

    // Only import loader if it exists
    let loaderValue = 'undefined';
    if (route.hasLoader) {
      const loaderName = `loader${index}`;
      imports.push(`import { loader as ${loaderName} } from '${importPath}';`);
      loaderValue = loaderName;
    }

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
