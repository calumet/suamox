export interface RouteRecord {
  path: string;
  filePath: string;
  name?: string;
  params: string[];
  isCatchAll: boolean;
  isIndex: boolean;
  segments: RouteSegment[];
  priority: number;
  layouts?: string[];
  hasLoader?: boolean;
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
