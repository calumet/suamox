import type { LoaderContext } from "@calumet/suamox";
import { useEffect, useState } from "react";

import { revalidar } from "../../lib/router";

let ticks = 0;

export function loader(_ctx: LoaderContext) {
  ticks += 1;
  return { ticks };
}

export default function RevalidarPage({ data }: { data: { ticks: number } | null }) {
  const [hydrated, setHydrated] = useState(false);
  const [pendiente, setPendiente] = useState(false);

  useEffect(() => setHydrated(true), []);

  const onClick = async (): Promise<void> => {
    setPendiente(true);
    try {
      await revalidar();
    } finally {
      setPendiente(false);
    }
  };

  return (
    <div>
      <h1>Revalidar</h1>
      <p data-testid="ticks">{data?.ticks ?? 0}</p>
      <button
        type="button"
        data-testid="revalidar"
        disabled={!hydrated || pendiente}
        onClick={() => void onClick()}
      >
        {pendiente ? "Cargando..." : "Revalidar"}
      </button>
    </div>
  );
}
