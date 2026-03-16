import { useLoaderData } from "@calumet/suamox";
import type { LoaderContext } from "@calumet/suamox";
import { Head } from "@calumet/suamox-head";

export function loader(_ctx: LoaderContext) {
  return {
    message: "loaded from server",
    timestamp: Date.now(),
  };
}

function ChildComponent() {
  const { message } = useLoaderData<{ message: string }>();
  return <p data-testid="child-message">Child says: {message}</p>;
}

export default function LoaderHookPage() {
  const { message, timestamp } = useLoaderData<{ message: string; timestamp: number }>();

  return (
    <div>
      <Head>
        <title>Loader Hook Test</title>
      </Head>
      <h1>Loader Hook Test</h1>
      <p data-testid="message">{message}</p>
      <p data-testid="timestamp">{timestamp}</p>
      <ChildComponent />
    </div>
  );
}
