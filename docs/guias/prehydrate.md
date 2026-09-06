# Prehydrate (`useClientValue`)

Cuando una pantalla depende de algo que solo existe en el navegador —`sessionStorage`, una cookie de JS, `navigator`— el HTML del servidor sale con un valor por defecto. Al hidratar, React ve el valor real y actualiza el DOM: el usuario ve un salto.

`useClientValue` evita ese salto. En SSR devuelve el fallback y registra un `<script>` inline que el framework inyecta al final del body. Ese script computa el valor real, corrige el DOM y lo deja en `window.__PREHYDRATE__`, de donde React lo lee al hidratar, asi que tampoco hay hydration mismatch.

```tsx
import { useClientValue } from "@calumet/suamox";

export function Header() {
  const isLoggedIn = useClientValue(false, () => !!sessionStorage.getItem("idUsr"), {
    show: "#btn-logout",
    hide: "#btn-login",
  });

  return (
    <header>
      <button id="btn-logout" hidden={!isLoggedIn}>
        Salir
      </button>
      <a id="btn-login" hidden={isLoggedIn}>
        Ingresar
      </a>
    </header>
  );
}
```

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

`suppressHydrationWarning` **no** lo arregla: silencia el aviso pero deja el valor del servidor, asi que el texto se queda mal. La solucion es que tambien se parchee:

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

Las dos funciones se serializan con `toString()` y se inyectan en un `<script>` que el navegador ejecuta como JS plano, fuera de React. Por eso:

- No pueden importar modulos.
- No pueden usar variables del componente ni closures.
- Solo APIs globales del navegador: `sessionStorage`, `localStorage`, `document`, `navigator`, `window`, `Date`.

**Su codigo acaba en el HTML publico.** No pongas ahi secretos ni logica de negocio que no quieras enseñar.

En desarrollo, si un selector de `show`/`hide` no encuentra ningun elemento, el script avisa por consola: un typo dejaria de corregir el DOM en silencio.

## Content Security Policy

El script es inline, asi que con una CSP estricta necesita un nonce. `generateHTML` acepta uno y lo aplica a los scripts que emite:

```ts
generateHTML({ ...opciones, nonce: nonceDeLaPeticion });
```

## Seguridad del script generado

El codigo que se inyecta se escapa antes de emitirlo: las secuencias `</script` y `<!--` salen con barra invertida para que no puedan cerrar el bloque. React **no** escapa `dangerouslySetInnerHTML`, asi que sin eso un `</script>` dentro de un `resolve` inyectaria HTML arbitrario en la pagina.

Los selectores se serializan con `JSON.stringify`, nunca se concatenan, por si vienen de una variable.

No se escapa `<` entero como en los datos del loader: aqui el contenido es codigo, y `<` solo vale dentro de un string, asi que romperia cualquier comparacion `a < b`.
