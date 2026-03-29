import type { ApiContext } from "@calumet/suamox";

export function POST({ request }: ApiContext): Response {
  const auth = request.headers.get("authorization") ?? "none";
  const contentType = request.headers.get("content-type") ?? "none";
  const cookie = request.headers.get("cookie") ?? "none";

  return new Response(
    JSON.stringify({
      method: request.method,
      authorization: auth,
      contentType,
      cookie,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
