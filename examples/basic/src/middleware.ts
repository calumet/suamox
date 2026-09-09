import type { MiddlewareContext, MiddlewareNext } from "@calumet/suamox";

export async function onRequest(
  context: MiddlewareContext,
  next: MiddlewareNext,
): Promise<Response> {
  context.locals.siteName = "Suamox Basic Example";
  context.locals.requestTime = Date.now();

  // El guardia de /protegido vive ahora en src/pages/(privado)/middleware.ts
  return next();
}
