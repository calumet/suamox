import { useClientValue } from "@calumet/suamox";

export default function PrehydratePage() {
  // Todo lo que depende del valor esta cubierto por show/hide, asi que el script
  // inline lo corrige antes de que React hidrate.
  const isLoggedIn = useClientValue(false, () => !!sessionStorage.getItem("idUsr"), {
    show: "#btn-logout, #estado-dentro",
    hide: "#btn-login, #estado-fuera",
  });

  // Los elementos que el script parchea llevan suppressHydrationWarning: React
  // compara contra el HTML del servidor, no contra el DOM ya corregido.
  return (
    <div>
      <h1 data-testid="titulo">Prehydrate</h1>

      <button
        id="btn-logout"
        hidden={!isLoggedIn}
        data-testid="btn-logout"
        suppressHydrationWarning
      >
        Salir
      </button>
      <a
        id="btn-login"
        href="/ingresar"
        hidden={isLoggedIn}
        data-testid="btn-login"
        suppressHydrationWarning
      >
        Ingresar
      </a>

      <p
        id="estado-dentro"
        hidden={!isLoggedIn}
        data-testid="estado-dentro"
        suppressHydrationWarning
      >
        dentro
      </p>
      <p id="estado-fuera" hidden={isLoggedIn} data-testid="estado-fuera" suppressHydrationWarning>
        fuera
      </p>

      {/* Prueba que React tiene el valor, no solo que el script parcheo el DOM */}
      <button
        data-testid="preguntar"
        onClick={(e) => {
          e.currentTarget.nextElementSibling!.textContent = String(isLoggedIn);
        }}
      >
        Que ve React
      </button>
      <span data-testid="respuesta" />

      {/* Enlace normal: lo intercepta el router, asi que la navegacion es SPA */}
      <a href="/time" data-testid="ir-time">
        Ir a /time
      </a>
    </div>
  );
}
