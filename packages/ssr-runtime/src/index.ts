export interface LoaderContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
}

export interface PageProps<T = any> {
  data: T;
}

export type GetStaticPaths = () => Promise<Array<{ params: Record<string, string> }>>;

// Implementation will be added in Phase 2
export function matchRoute(_routes: any[], _pathname: string): any {
  throw new Error('Not implemented');
}

export async function renderPage(_options: any): Promise<any> {
  throw new Error('Not implemented');
}

export async function prerender(_options: any): Promise<void> {
  throw new Error('Not implemented');
}
