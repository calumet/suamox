export function loader(): never {
  throw new Error("loader roto a proposito");
}

export default function LoaderRotoPage() {
  return <h1>Nunca se renderiza</h1>;
}
