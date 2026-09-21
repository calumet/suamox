# Prehydrate (`useClientValue`)

Cuando una pantalla depende de algo que solo existe en el navegador —`sessionStorage`, una cookie de JS, `navigator`— el HTML del servidor sale con un valor por defecto. Al hidratar, React ve el valor real y actualiza el DOM: el usuario ve un salto.

`useClientValue` evita ese salto. En SSR devuelve el fallback y registra un `<script>` inline que el framework inyecta al final del body; ese script corrige el DOM antes del primer pintado. El valor con el que React trabaja sale de ejecutar `resolve` en el cliente, **no del script**, asi que si el script falla la pantalla converge igual.

```tsx
import { useClientValue } from "@calumet/suamox";

export function Header() {
  const isLoggedIn = useClientValue(false, () => !!sessionStorage.getItem("idUsr"), {
    show: "#btn-logout",
    hide: "#btn-login",
  });

  return (
    <header>
      <button id="btn-logout" hidden={!isLoggedIn} suppressHydrationWarning>
        Salir
      </button>
      <a id="btn-login" hidden={isLoggedIn} suppressHydrationWarning>
        Ingresar
      </a>
    </header>
  );
}
```

Los elementos que aparecen en `show`/`hide` llevan `suppressHydrationWarning` para callar un aviso de consola, y solo para eso.

Lo que discrepa no es el HTML del servidor, que React ya no vuelve a ver. React recorre el DOM, se encuentra la correccion que dejo el script y la compara contra su propio primer render, que `useSyncExternalStore` construye a partir de `getServerSnapshot` precisamente para que reproduzca al servidor. Por eso el aviso dice que el cliente quiere el fallback:

```
<button id="btn-logout"
+   hidden={true}     lo que React renderiza al hidratar
-   hidden={null}     lo que el script ya dejo en el DOM
```

**No es obligatorio.** Sin la marca el valor acaba igual de bien, porque el store re-renderiza en cuanto `getSnapshot` y `getServerSnapshot` dejan de coincidir, y React sigue mandando sobre el elemento despues de hidratar. Lo unico que cambia es un `console.error` en desarrollo, uno por pasada de hidratacion, que lista los elementos afectados. En produccion React no avisa. Lo fijan los e2e de `tests/prehydrate.spec.ts` contra `/prehydrate-sin-marca`.

## La firma

```ts
useClientValue(fallback, resolve, patch?)
```

- `fallback`: el valor con el que renderiza el servidor.
- `resolve`: computa el valor real en el navegador.
- `patch` (opcional): que corregir en el DOM antes de que React hidrate.

`patch` puede ser declarativo, `{ show, hide }` con cualquier selector CSS —incluidas listas separadas por comas—, o una funcion para casos que no son mostrar u ocultar:

```tsx
const hora = useClientValue(
  "00:00:00",
  () => new Date().toLocaleTimeString(),
  (valor) => {
    document.getElementById("reloj")!.textContent = valor;
  },
);
```

Sin `patch` no hay correccion visual: React hidrata con el valor correcto, pero el HTML del servidor se ve con el fallback hasta entonces. Sirve cuando el cambio no se nota.

## Usa `hidden`, no una clase ni un atributo propio

`show` y `hide` aplican el atributo `hidden` nativo. En el JSX escribes `hidden={!isLoggedIn}` a secas, sin `|| undefined`: React omite el atributo cuando el valor es `false`, mientras que un `data-*` lo emitiria como la cadena `"false"` y un selector `[data-x]` acabaria casandolo igual.

Ademas `hidden` es semantico: los lectores de pantalla lo respetan, y no hace falta que el framework inyecte CSS global.

Un aviso: `hidden` lo pisa cualquier regla que fije `display` en ese elemento. Si usas un framework de CSS que lo haga, añade una vez:

```css
[hidden] {
  display: none !important;
}
```

## Todo lo que dependa del valor tiene que estar en el patch

El script solo toca lo que le indiques. Cualquier otra cosa derivada del valor seguira renderizada con el fallback y provocara un mismatch:

```tsx
// mal: el texto no lo cubre show/hide
<p>{isLoggedIn ? "dentro" : "fuera"}</p>
```

`suppressHydrationWarning` tampoco lo arregla, aunque no por lo que suele decirse. El texto no se queda mal, React lo corrige al re-renderizar. El problema es cuando. Ese render llega despues del primer pintado, que es exactamente el parpadeo que el hook existe para quitar: medido a 6x de CPU, el boton parcheado se corrige a los 192 ms y el primer pintado cae a los 196, mientras que el texto no se mueve hasta los 620. La solucion es que tambien se parchee:

```tsx
// bien: los dos parrafos entran en show/hide
const isLoggedIn = useClientValue(false, () => !!sessionStorage.getItem("idUsr"), {
  show: "#btn-logout, #estado-dentro",
  hide: "#btn-login, #estado-fuera",
});

<p id="estado-dentro" hidden={!isLoggedIn}>dentro</p>
<p id="estado-fuera" hidden={isLoggedIn}>fuera</p>
```

## Restricciones de `resolve` y `patch`

`resolve` se usa de dos formas, y solo una impone restricciones:

- **Para el valor de React** se ejecuta como cualquier funcion del cliente. Ahi puede usar lo que quiera.
- **Para el `<script>` inline** se serializa con `toString()` y el navegador lo ejecuta como JS plano, fuera de React y sin el bundle. Ahi no valen imports, variables del componente, constantes de modulo ni funciones con `.bind()`.

Si el script falla por eso, en una ruta normal la unica consecuencia es que se pierde la correccion antes del primer pintado: React converge igual al hidratar, y el fallo se avisa por consola. Escribe `resolve` autocontenido, con solo APIs globales del navegador (`sessionStorage`, `localStorage`, `document`, `navigator`, `Date`).

**La excepcion es `prerender`.** Una pagina estatica no lleva el JavaScript de la app, asi que no hay hidratacion y no hay nada que converja: ahi el script inline es la unica correccion que existe. Si falla, o si algo que depende del valor no esta en `patch`, se queda mal de forma permanente. En rutas prerenderizadas conviene revisar la consola una vez.

`resolve` debe devolver **un primitivo**. Se llama en cada render y el resultado se compara con `Object.is`, asi que devolver un objeto nuevo cada vez provocaria un bucle de renders.

**El codigo de `resolve` acaba en el HTML publico.** No pongas ahi secretos ni logica de negocio que no quieras enseñar.

## Lo que este hook no hace

No se suscribe a la fuente. Si `sessionStorage` cambia mientras la pagina esta abierta, el valor se relee en el siguiente render, pero nada lo dispara por si solo. Para estado que cambia en vivo, usa un store de verdad.

## Content Security Policy

El script es inline, asi que con una CSP estricta hay que autorizarlo. Las dos rutas estan cubiertas, porque en SSG un nonce por peticion no existe.

**SSR** — el adaptador genera un nonce por peticion, lo pone en todos los scripts inline y emite la cabecera:

```ts
await createServer({ port: 3000, csp: true });
// o con directivas propias:
await createServer({ port: 3000, csp: { directives: "object-src 'none'" } });
```

`directives` son directivas **adicionales**, no tokens de `script-src`: se unen con `;`. La politica que emite es `script-src 'self' 'nonce-…'`, asi que los scripts externos siguen entrando por `'self'`; todavia no se puede migrar a `'strict-dynamic'`.

**SSG** — no hay peticion, asi que se usa el hash de cada script, emitido en un `<meta>` de la propia pagina:

```ts
await runSsg({ csp: true });
```

```html
<meta http-equiv="content-security-policy" content="script-src 'self' 'sha256-...'" />
```

Si construyes el HTML a mano, `generateHTML` acepta las dos formas: `nonce` para la cabecera y `csp: { hash }` para el `<meta>`. El hasher se pasa desde `@calumet/suamox/csp`, que es server-only:

```ts
import { cspHasher } from "@calumet/suamox/csp";

generateHTML({ ...opciones, csp: cspHasher });
```

## Seguridad del script generado

El codigo que se inyecta se escapa antes de emitirlo: las secuencias `</script` y `<!--` salen con barra invertida para que no puedan cerrar el bloque ni abrir un comentario HTML. El escape se aplica a la cadena **ya montada**, con los selectores dentro, que es lo que cierra la via de entrada por datos.

Los selectores se serializan con `JSON.stringify`, nunca se concatenan, por si vienen de una variable.

No se escapa `<` entero como en los datos del loader: aqui el contenido es codigo, y `<` solo vale dentro de un string, asi que romperia cualquier comparacion `a < b`.

El script va envuelto en un `try/catch`: un fallo suyo no puede tumbar el resto de la pagina, y el valor de React no depende de el.
