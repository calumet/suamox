# API Routes

Suamox permite crear endpoints HTTP server-only en `src/api/`. Los API routes se ejecutan exclusivamente en el servidor y nunca se incluyen en el bundle del cliente.

## Ubicacion

Los archivos en `src/api/` se mapean a rutas `/api/`:

```
src/api/health.ts       -> GET /api/health
src/api/session.ts      -> POST /api/session, DELETE /api/session
src/api/users/[id].ts   -> GET /api/users/:id, PUT /api/users/:id
```

Las mismas reglas de routing que las paginas aplican: `[param]` para parametros dinamicos, `[...param]` para catch-all.

## Exports

Un archivo exporta funciones nombradas por metodo HTTP:

```ts
import type { ApiContext } from "@calumet/suamox";

export async function GET({ params, query }: ApiContext): Promise<Response> {
  const id = params.id;
  const user = await db.findUser(id);
  return new Response(JSON.stringify(user), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST({ request }: ApiContext): Promise<Response> {
  const body = await request.json();
  const user = await db.createUser(body);
  return new Response(JSON.stringify(user), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}
```

Metodos soportados: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`.

Si se hace request con un metodo que el archivo no exporta, se retorna `405 Method Not Allowed` con header `Allow` listando los metodos disponibles.

## ApiContext

```ts
interface ApiContext {
  request: Request; // Request HTTP original (con headers, cookies, body)
  url: URL; // URL parseada
  params: Record<string, string>; // Parametros de ruta
  query: URLSearchParams; // Query string
  locals: Record<string, unknown>; // Datos del middleware
}
```

`locals` viene del middleware, igual que en los loaders de paginas. El middleware se ejecuta antes de los API handlers.

## Ejemplo: Manejo de cookies HttpOnly

Un caso de uso comun es manejar cookies de sesion de forma segura. El frontend no debe ver ni manipular cookies HttpOnly, asi que el API route actua como proxy:

```ts
// src/api/session.ts
import type { ApiContext } from "@calumet/suamox";

export async function POST({ request }: ApiContext): Promise<Response> {
  const body = await request.text();
  const credentials = new URLSearchParams(body);

  // Autenticar contra el backend
  const res = await fetch("https://backend.example.com/login", {
    method: "POST",
    body: JSON.stringify({
      user: credentials.get("user"),
      password: credentials.get("password"),
    }),
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: "Credenciales invalidas" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { sessionId } = await res.json();

  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `__session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Secure`,
    },
  });
}

export async function DELETE(): Promise<Response> {
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `__session=; HttpOnly; SameSite=Strict; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    },
  });
}
```

Desde el cliente:

```ts
// Login
await fetch("/api/session", {
  method: "POST",
  body: new URLSearchParams({ user: "admin", password: "1234" }),
});

// Logout
await fetch("/api/session", { method: "DELETE" });
```

## Diferencias con loaders

|                      | Loaders                    | API Routes                 |
| -------------------- | -------------------------- | -------------------------- |
| Ubicacion            | `src/pages/`               | `src/api/`                 |
| Metodos HTTP         | Solo GET (via `/__data`)   | Cualquier metodo           |
| Retorno              | Datos serializables (JSON) | Objeto `Response` completo |
| Headers de respuesta | No controlables            | Control total              |
| Bundle del cliente   | Excluidos via proxy        | Excluidos completamente    |
| Layouts              | Si                         | No                         |

## Restricciones

- Los API routes son server-only: nunca entran en el bundle del cliente. Importar un archivo de `src/api/` desde codigo del cliente causa un error de build.
- No tienen componentes React, layouts, loaders, prerender, ni getStaticPaths.
- El client-side router no intercepta links a `/api/*`. El browser hace requests HTTP normales.
- El endpoint `/__data` (usado para navegacion SPA) ignora los API routes.
