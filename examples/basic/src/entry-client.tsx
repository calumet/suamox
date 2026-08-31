import { revalidar, startRouter } from "@calumet/suamox-router";
import { routes } from "virtual:pages";

import "./styles/global.css";

// Caso de prueba: pedir revalidacion antes de que el router exista
if (new URLSearchParams(window.location.search).has("revalidar-temprano")) {
  void revalidar();
}

void startRouter({ routes });
