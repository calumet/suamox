import { Head } from '@suamox/head';
import { useEffect, useState } from 'react';

export default function CounterPage() {
  const [count, setCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div>
      <Head>
        <title>Suamox - Counter</title>
        <meta name="description" content="Counter hydration example." />
      </Head>
      <h1>Counter</h1>
      <p>Count: {count}</p>
      <button type="button" onClick={() => setCount((value) => value + 1)} disabled={!hydrated}>
        {hydrated ? 'Increment' : 'Loading...'}
      </button>
    </div>
  );
}
