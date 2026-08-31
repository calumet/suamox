import type { RouterInstance } from "@calumet/suamox-router";

let instance: RouterInstance | null = null;

export function setRouter(router: RouterInstance): void {
  instance = router;
}

export function revalidar(): Promise<void> {
  return instance ? instance.revalidar() : Promise.resolve();
}
