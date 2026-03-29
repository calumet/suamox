import type { ApiContext } from "@calumet/suamox";

export async function POST({ request }: ApiContext): Promise<Response> {
  const body = await request.text();
  const sessionId = new URLSearchParams(body).get("sessionId");

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Missing sessionId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `__session=${sessionId}; HttpOnly; SameSite=Strict; Path=/`,
    },
  });
}

export function DELETE(): Response {
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `__session=; HttpOnly; SameSite=Strict; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    },
  });
}
