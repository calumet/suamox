import type { MiddlewareContext, MiddlewareNext } from "@calumet/suamox";

export async function onRequest(context: MiddlewareContext, next: MiddlewareNext) {
  context.locals.requestTime = Date.now();
  return next();
}
