import { redirect } from "@calumet/suamox";
import type { MiddlewareContext, MiddlewareNext } from "@calumet/suamox";

// Protege el grupo entero. `/protegido` no tiene nada en su URL que diga que lo
// esta, y el guardia no depende de que nadie se acuerde de anadirlo a una lista
export async function onRequest(
  context: MiddlewareContext,
  next: MiddlewareNext,
): Promise<Response> {
  if (!context.locals.user) {
    redirect("/");
  }

  return next();
}
