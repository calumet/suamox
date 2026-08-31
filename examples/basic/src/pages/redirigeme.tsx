import { redirect } from "@calumet/suamox";

export function loader() {
  redirect("/time");
}

export default function RedirigemePage() {
  return <h1>Nunca se renderiza</h1>;
}
