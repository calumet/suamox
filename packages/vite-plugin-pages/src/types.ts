export interface RouteRecord {
  path: string;
  filePath: string;
  name?: string;
  params: string[];
  isCatchAll: boolean;
  isIndex: boolean;
  segments: RouteSegment[];
  priority: number;
  getStaticPaths?: GetStaticPaths;
  prerender?: boolean;
  layouts?: string[];
  hasLoader?: boolean;
  hasGetStaticPaths?: boolean;
  hasPrerender?: boolean;
}

export interface RouteSegment {
  type: 'static' | 'param' | 'catchAll';
  value: string;
  paramName?: string;
}

export interface ParsedRoute {
  route: RouteRecord;
  errors: string[];
}

export type GetStaticPaths = () => Promise<Array<{ params: Record<string, string> }>>;
