import type { LoaderContext } from "@calumet/suamox";
import { Head } from "@calumet/suamox-head";

export function loader(_ctx: LoaderContext) {
  return { time: new Date().toISOString(), secret: process.env.TEST_SECRET ?? "server-only" };
}

interface TimeData {
  time: string;
  secret: string;
}

export default function TimePage({ data }: { data: TimeData | null }) {
  return (
    <div>
      <Head>
        <title>Server Time</title>
      </Head>
      <h1>Server Time</h1>
      <p data-testid="time">{data?.time ?? "no data"}</p>
      <p data-testid="secret">{data?.secret ?? "no data"}</p>
      <a href="/dashboard">Go to Dashboard</a>
    </div>
  );
}
