import { redirect } from "@calumet/suamox";
import type { MiddlewareContext, MiddlewareNext } from "@calumet/suamox";

export async function onRequest(
  context: MiddlewareContext,
  next: MiddlewareNext,
): Promise<Response> {
  context.locals.siteName = "Suamox Basic Example";
  context.locals.requestTime = Date.now();

  if (context.pathname.startsWith("/protegido")) {
    redirect("/");
  }

  return next();
}
