import { redirect } from "@calumet/suamox";

export function loader() {
  redirect("/");
}

export default function RedirigemePage() {
  return <h1>Nunca se renderiza</h1>;
}
