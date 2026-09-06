import { useClientValue } from "@calumet/suamox";

export default function PrehydratePage() {
  // Todo lo que depende del valor esta cubierto por show/hide, asi que el script
  // inline lo corrige antes de que React hidrate: sin parpadeo y sin mismatch.
  const isLoggedIn = useClientValue(false, () => !!sessionStorage.getItem("idUsr"), {
    show: "#btn-logout, #estado-dentro",
    hide: "#btn-login, #estado-fuera",
  });

  return (
    <div>
      <h1 data-testid="titulo">Prehydrate</h1>

      <button id="btn-logout" hidden={!isLoggedIn} data-testid="btn-logout">
        Salir
      </button>
      <a id="btn-login" href="/ingresar" hidden={isLoggedIn} data-testid="btn-login">
        Ingresar
      </a>

      <p id="estado-dentro" hidden={!isLoggedIn} data-testid="estado-dentro">
        dentro
      </p>
      <p id="estado-fuera" hidden={isLoggedIn} data-testid="estado-fuera">
        fuera
      </p>
    </div>
  );
}
