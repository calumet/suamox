import { revalidate } from "@calumet/suamox-router";

// `src/client.ts` es opcional y corre antes de que el router arranque. Aqui
// sirve para el caso de pedir revalidacion cuando todavia no existe.
if (new URLSearchParams(window.location.search).has("revalidar-temprano")) {
  void revalidate();
}
