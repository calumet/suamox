// Modulo de servidor con efecto de nivel de modulo: Rollup no lo puede podar por
// tree-shaking, asi que solo desaparece del cliente si el import se borra del codigo.
const registro = new Map<string, number>();
registro.set("MARKER_MODULE_SIDE_EFFECT_ABCDE", Date.now());

export function contarVisita(clave: string): number {
  const previo = registro.get(clave) ?? 0;
  registro.set(clave, previo + 1);
  return previo + 1;
}
