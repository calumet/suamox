import { useClientValue } from "@calumet/suamox";
import { useState } from "react";

/**
 * La misma pagina que /prehydrate, sin `suppressHydrationWarning`.
 *
 * Existe para fijar que la marca no es obligatoria. Mirar el DOM no lo
 * demuestra: el script inline lo parchea igual, asi que la pantalla sale bien
 * tenga React el valor que tenga. Por eso hay dos sondas que el script no toca.
 *
 *   - `respuesta` la escribe un handler de React a partir del valor, asi que
 *     dice que tiene React y no que dejo el script.
 *   - `invertir` fuerza un render despues de hidratar. React avisa de que la
 *     diferencia de atributos no se repara ("won't be patched up"), y esto
 *     comprueba que aun asi sigue mandando sobre el elemento.
 */
export default function PrehydrateSinMarcaPage() {
  const isLoggedIn = useClientValue(false, () => !!sessionStorage.getItem("idUsr"), {
    show: "#sm-logout",
    hide: "#sm-login",
  });

  const [invertido, setInvertido] = useState(false);
  const v = invertido ? !isLoggedIn : isLoggedIn;

  return (
    <div>
      <h1 data-testid="titulo">Prehydrate sin marca</h1>

      <button id="sm-logout" hidden={!v} data-testid="sm-logout">
        Salir
      </button>
      <a id="sm-login" href="/ingresar" hidden={v} data-testid="sm-login">
        Ingresar
      </a>

      {/* Que ve React, no que dejo el script */}
      <button
        data-testid="preguntar"
        onClick={(e) => {
          e.currentTarget.nextElementSibling!.textContent = String(isLoggedIn);
        }}
      >
        Que ve React
      </button>
      <span data-testid="respuesta" />

      {/* Un render nuevo despues de hidratar */}
      <button data-testid="invertir" onClick={() => setInvertido((x) => !x)}>
        Invertir
      </button>
    </div>
  );
}
