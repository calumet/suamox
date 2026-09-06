import { useClientValue } from "@calumet/suamox";
import { useEffect, useState } from "react";

const CLAVE = "idUsr";

/** El patron habitual: el valor real solo se conoce despues de hidratar */
function SinPrehydrate() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // El setState en el efecto es justo lo que esta demo enseña: es el patron que
    // provoca el salto, porque el valor real no llega hasta despues de hidratar
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoggedIn(!!sessionStorage.getItem(CLAVE));
  }, []);

  return (
    <section style={{ border: "2px solid #c00", padding: "1rem", borderRadius: 8 }}>
      <h2>Sin useClientValue</h2>
      <p style={{ color: "#666", fontSize: 14 }}>useState + useEffect</p>
      <button id="sin-logout" hidden={!isLoggedIn} data-testid="sin-logout">
        Salir
      </button>
      <a id="sin-login" href="#" hidden={isLoggedIn} data-testid="sin-login">
        Ingresar
      </a>
    </section>
  );
}

/** El script inline corrige el DOM antes de que React hidrate */
function ConPrehydrate() {
  const isLoggedIn = useClientValue(false, () => !!sessionStorage.getItem("idUsr"), {
    show: "#con-logout",
    hide: "#con-login",
  });

  return (
    <section style={{ border: "2px solid #0a0", padding: "1rem", borderRadius: 8 }}>
      <h2>Con useClientValue</h2>
      <p style={{ color: "#666", fontSize: 14 }}>script inline antes de hidratar</p>
      <button id="con-logout" hidden={!isLoggedIn} data-testid="con-logout">
        Salir
      </button>
      <a id="con-login" href="#" hidden={isLoggedIn} data-testid="con-login">
        Ingresar
      </a>
    </section>
  );
}

export default function CompararPage() {
  const [registro, setRegistro] = useState<string[]>([]);

  useEffect(() => {
    const paint = performance.getEntriesByName("first-contentful-paint")[0];
    const lineas = [
      `primer paint: ${paint ? Math.round(paint.startTime) : "?"} ms`,
      `con useClientValue: corregido por el script inline, antes del paint`,
      `sin useClientValue: corregido al hidratar, ${Math.round(performance.now())} ms`,
    ];
    // Los tiempos solo se conocen despues del primer render, de ahi el setState
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegistro(lineas);
  }, []);

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
      <h1>Comparacion de prehydrate</h1>
      <p>
        Pulsa <b>Simular sesion</b> y observa los dos bloques al recargar. El rojo parpadea: muestra
        &quot;Ingresar&quot; hasta que React hidrata. El verde sale ya correcto.
      </p>
      <p style={{ background: "#ffd", padding: "0.75rem", borderRadius: 6, fontSize: 14 }}>
        En un portatil rapido el parpadeo dura ~50 ms y casi no se ve. Para apreciarlo, abre
        DevTools &rarr; Performance &rarr; <b>CPU: 6x slowdown</b> y recarga: la ventana pasa a ~300
        ms. El bloque verde se corrige siempre <b>antes</b> del primer paint, el rojo siempre
        despues.
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
        <SinPrehydrate />
        <ConPrehydrate />
      </div>

      <h3>Registro</h3>
      <ul data-testid="registro">
        {registro.map((linea) => (
          <li key={linea}>{linea}</li>
        ))}
      </ul>
    </div>
  );
}
