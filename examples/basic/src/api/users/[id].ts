import type { ApiContext } from "@calumet/suamox";

export function GET({ params, query }: ApiContext): Response {
  const format = query.get("format") ?? "json";

  return new Response(
    JSON.stringify({
      id: params.id,
      name: `User ${params.id}`,
      format,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

export async function PUT({ params, request }: ApiContext): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;

  return new Response(
    JSON.stringify({
      id: params.id,
      updated: true,
      receivedName: body.name,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
