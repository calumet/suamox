// Estado del servidor que la acción escribe y el loader lee, como la caché de un BFF
const notas: string[] = [];

export function listarNotas(): string[] {
  return [...notas];
}

export function guardarNota(texto: string): number {
  notas.push(texto);
  return notas.length;
}
