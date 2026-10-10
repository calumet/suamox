# Acciones

Una acción es una función que se escribe en un archivo `*.actions.ts`, se importa desde un componente como cualquier otra y corre en el servidor. Es la contraparte del `loader`: el loader lee al renderizar, la acción escribe cuando el usuario hace algo.

Sirve cuando la escritura tiene que pasar por el servidor de Suamox. El caso típico es un BFF que guarda en memoria lecturas del backend: guardar un cambio desde el navegador directo al backend deja esa caché vieja, porque el servidor de Suamox no se entera. Con una acción, la escritura y la invalidación corren juntas en el servidor.

Las acciones no usan `/api`, así que conviven con un backend servido bajo `/api` en el mismo origen. Se exponen en `POST /__actions/<id>`, igual que `/__data` es el endpoint de datos del router.

## Definir una acción

Cada export de un `*.actions.ts` es una acción. El archivo puede vivir en cualquier parte del grafo de la app: en `src/` o en un paquete del workspace que exporte su fuente.

```ts
// features/portal/ajustes.actions.ts
import { getActionContext } from "@calumet/suamox/server";

import { tema } from "./cache.server";

export async function guardarTema(valores: TemaRequest): Promise<void> {
  const { request } = getActionContext();
  await backend(request).put("/api/portal/tema", { body: valores });
  await tema.invalidar();
}
```

```tsx
// features/portal/components/editor-de-tema.tsx
import { revalidate } from "@calumet/suamox-router";

import { guardarTema } from "../ajustes.actions";

const guardar = async (valores: TemaRequest) => {
  await guardarTema(valores);
  await revalidate();
};
```

En el bundle del navegador el plugin reemplaza el archivo entero por un stub por export que hace el `POST`. Ninguna línea del original llega al cliente, y con ella tampoco lo que importa.

Cada export tiene que ser una función declarada en el mismo archivo, y si no lo es, el build falla. Una constante, una clase, un `export *` o un reexport de otro módulo (`export { borrar } from "./usuarios.server"`) son errores: un reexport expondría como endpoint lo que el otro módulo exporta para su propio uso. Los exports de tipos no cuentan. La función debe devolver una promesa, porque en el navegador la llamada siempre es asíncrona.

El nombre se reconoce sin distinguir mayúsculas y con cualquier extensión de módulo (`.ts`, `.tsx`, `.mts`, `.js`...). Los `*.actions.*` de `node_modules` no son acciones, porque Redux y NgRx usan el mismo nombre. Para tratarlos como tales, `suamoxPages({ actionsInDependencies: true })`.

## Contexto

`getActionContext()` devuelve la petición que invocó la acción. Solo funciona dentro de una acción:

```ts
interface ActionContext {
  request: Request; // Con las cookies y cabeceras del navegador
  url: URL;
  locals: Record<string, unknown>; // Lo que dejó el middleware global
}
```

`request` llega sin cuerpo y sin las cabeceras que lo describían (`content-type`, `content-length`): el cuerpo lo lee el adaptador para sacar los argumentos. Así se puede reenviar al backend sin que esas cabeceras mientan.

## Argumentos y respuesta

Los argumentos viajan en JSON. La excepción es un único `FormData`, que viaja tal cual:

```ts
export async function enviarContacto(form: FormData): Promise<void> {
  // ...
}
```

Los tipos de TypeScript no llegan al servidor: cualquiera puede llamar a la acción con otro JSON, con más argumentos o con objetos donde se esperaba un texto. Trata cada argumento como `unknown` y valídalo antes de usarlo, sobre todo si se mezcla con otro objeto o se reenvía al backend tal como llegó.

Un archivo grande no debería pasar por una acción. Cada byte entra al servidor de Suamox y vuelve a salir hacia el backend, y la petición ocupa memoria mientras dura. Si el backend está en el mismo origen, el navegador le sube el archivo directo y la acción solo recibe el id que devuelve.

Lo que devuelve la acción llega al cliente serializado igual que los datos de un loader, así que un `Date` o un `Map` sobreviven al viaje.

- `undefined` responde `204` y el cliente recibe `undefined`.
- Un `Response` pasa tal cual, con su estado y sus cabeceras, salvo las `x-suamox-*`, que solo pone el adaptador.
- Una excepción responde `500` sin detalles, y el error sale en el log del servidor.

Si la respuesta no es `2xx`, la llamada lanza un `ActionError` con `status` y `data`, el cuerpo ya leído. Para propagar un error del backend con su cuerpo, la acción devuelve un `Response`:

```ts
// En la acción
return Response.json({ codigo: "NO_VALIDO" }, { status: 422 });
```

```ts
// En el componente
import { ActionError } from "@calumet/suamox-router";

try {
  await guardarTema(valores);
} catch (error) {
  if (error instanceof ActionError && error.status === 422) {
    mostrar((error.data as { codigo: string }).codigo);
  }
}
```

Una redirección no se sigue. Si el middleware o la acción responden con un 3xx, o la acción lanza `redirect()`, la llamada lanza un `ActionError` con el estado de la redirección y `data.redirect` con el destino, y quien llama decide si navega. Si la redirigió el middleware, la acción no corrió. Si la redirigió la acción, pudo escribir antes. `data.redirect` puede venir de lo que devolvió el servidor, así que antes de navegar a una URL absoluta conviene comprobar que sea del mismo origen.

Una acción no revalida sola. Después de escribir, llama a `revalidate()` del router para volver a correr los loaders de la ruta activa.

## Seguridad

Cada acción es un endpoint público: cualquiera que lea el bundle encuentra su id. El id está firmado con una clave del build, así que no se puede calcular a partir de la ruta y el nombre, y la URL no deja ver cómo está organizado el código. Eso reduce lo expuesto, pero no protege nada por sí solo.

- **Origen.** El adaptador solo acepta peticiones con `Sec-Fetch-Site: same-origin`. Sin esa cabecera exige un `Origin` del mismo host, y sin ninguna de las dos rechaza con `403`.
- **Middleware.** Corre `src/middleware.ts`, el global, con `pathname` igual a `/__actions/<id>` y `context.action` con el `file` (relativo a la raíz) y el `name` de la acción. Con eso un guardia puede autorizar por acción. No corren los `middleware.ts` de carpeta, porque la acción no pertenece a ninguna ruta: un guardia que protege `/admin` no protege una acción que solo se usa desde ahí. El módulo de la acción se carga y el cuerpo se lee después del middleware, así que una petición que el guardia deniega no ejecuta nada de la acción. El middleware no ve el cuerpo.
- **Autorización.** La decide quien recibe la escritura, normalmente el backend con la cookie que la acción le reenvía. Si la acción decide algo por su cuenta, lo comprueba ella, dentro de la función.
- **Lo que no se usa no se expone.** En el build, solo son endpoints las acciones cuyo stub quedó en el bundle del navegador. Un export que ningún componente importa no tiene endpoint.
- **El código no sale del servidor en el build.** El navegador recibe un stub por export, también en los mapas de fuente y en los workers. Importar el archivo con `?raw` o `?url` desde el cliente, o desde un worker, es un error de build. En dev, Vite sirve el fuente de cualquier archivo del proyecto a quien lo pida por URL, como con cualquier otro módulo.
- **Dev escucha en `localhost`.** Como Vite, el servidor de desarrollo no acepta conexiones de la red local salvo que se pida otra interfaz con `createServer({ hostname })`.

## Límites

- **Tamaño del cuerpo.** El adaptador limita toda petición a 1 MB, también la de una acción.
- **Build en orden.** El build del cliente escribe `dist/.vite/actions.json` y el del servidor lo lee para armar su tabla de acciones. `suamox build` los corre en ese orden.
- **Dependencias precompiladas.** En dev, Vite empaqueta por adelantado lo que viene de `node_modules`, y ahí el plugin no ve el archivo. Una acción de un paquete del workspace funciona porque se enlaza como fuente. Uno publicado en JavaScript compilado solo se transforma en el build.
- **Ids entre despliegues.** La clave del build se genera en cada `suamox build`, así que los ids cambian en cada despliegue. Una pestaña abierta con el bundle anterior recibe `404` al llamar a la acción hasta que recarga.
- **Varias réplicas.** Si cada réplica se construye por separado, cada una tendría ids distintos y un balanceador las rompería. Para eso se fija la clave con la variable `SUAMOX_ACTIONS_KEY` en el build de todas. Con una sola imagen construida una vez no hace falta.
