export interface LoaderContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PageProps<T = any> {
  data: T;
}

export type GetStaticPaths = () => Promise<Array<{ params: Record<string, string> }>>;

// Implementation will be added in Phase 2
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function matchRoute(_routes: any[], _pathname: string): any {
  throw new Error('Not implemented');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renderPage(_options: any): any {
  throw new Error('Not implemented');
}

export function prerender(_options: unknown): void {
  throw new Error('Not implemented');
}
