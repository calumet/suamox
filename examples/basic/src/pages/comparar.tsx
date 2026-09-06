import { useClientValue } from "@calumet/suamox";
import { useSyncExternalStore } from "react";

const CLAVE = "idUsr";
const sinSuscripcion = () => () => {};
const leerSesion = () => !!sessionStorage.getItem("idUsr");

/**
 * Lo que se hace hoy sin el framework: `useSyncExternalStore` con un snapshot de
 * servidor. Es correcto y converge al valor real, pero solo despues de hidratar.
 */
function SinScriptInline() {
  const isLoggedIn = useSyncExternalStore(sinSuscripcion, leerSesion, () => false);

  return (
    <section style={{ border: "2px solid #c00", padding: "1rem", borderRadius: 8 }}>
      <h2>useSyncExternalStore a secas</h2>
      <p style={{ color: "#666", fontSize: 14 }}>se corrige al hidratar</p>
      <button id="sin-logout" hidden={!isLoggedIn} data-testid="sin-logout">
        Salir
      </button>
      <a id="sin-login" href="#" hidden={isLoggedIn} data-testid="sin-login">
        Ingresar
      </a>
    </section>
  );
}

/** Lo mismo, mas el script inline que adelanta la correccion al primer pintado */
function ConScriptInline() {
  const isLoggedIn = useClientValue(false, () => !!sessionStorage.getItem("idUsr"), {
    show: "#con-logout",
    hide: "#con-login",
  });

  return (
    <section style={{ border: "2px solid #0a0", padding: "1rem", borderRadius: 8 }}>
      <h2>useClientValue</h2>
      <p style={{ color: "#666", fontSize: 14 }}>se corrige antes de pintar</p>
      <button
        id="con-logout"
        hidden={!isLoggedIn}
        data-testid="con-logout"
        suppressHydrationWarning
      >
        Salir
      </button>
      <a
        id="con-login"
        href="#"
        hidden={isLoggedIn}
        data-testid="con-login"
        suppressHydrationWarning
      >
        Ingresar
      </a>
    </section>
  );
}

export default function CompararPage() {
  const entrar = () => {
    sessionStorage.setItem(CLAVE, "42");
    location.reload();
  };
  const salir = () => {
    sessionStorage.removeItem(CLAVE);
    location.reload();
  };

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 640, padding: "1rem" }}>
      <h1>Que aporta el script inline</h1>
      <p>
        Los dos bloques acaban en el estado correcto: el de abajo no es «lo que funciona» frente a
        «lo que no». La diferencia es <b>cuando</b> se corrige. El rojo espera a que React hidrate;
        el verde ya sale bien del HTML.
      </p>
      <p style={{ background: "#ffd", padding: "0.75rem", borderRadius: 6, fontSize: 14 }}>
        Pulsa <b>Simular sesion</b>. En un portatil rapido la diferencia dura ~50 ms y casi no se
        ve: abre DevTools &rarr; Performance &rarr; <b>CPU 6x slowdown</b> y recarga.
      </p>

      <p>
        <button onClick={entrar} data-testid="entrar">
          Simular sesion y recargar
        </button>{" "}
        <button onClick={salir} data-testid="salir">
          Cerrar sesion y recargar
        </button>
      </p>

      <div style={{ display: "grid", gap: "1rem" }}>
        <SinScriptInline />
        <ConScriptInline />
      </div>
    </div>
  );
}
