import type { Hono } from 'hono';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface HonoAdapterOptions {
  onRequest?: (c: any) => void | Promise<void>;
  onBeforeRender?: (ctx: any) => Promise<any>;
  onAfterRender?: (result: any) => Promise<any>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Implementation will be added in Phase 3
export function createHonoApp(_options: HonoAdapterOptions = {}): Hono {
  throw new Error('Not implemented');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDevHandler(_options: any): any {
  throw new Error('Not implemented');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createProdHandler(_options: any): any {
  throw new Error('Not implemented');
}
