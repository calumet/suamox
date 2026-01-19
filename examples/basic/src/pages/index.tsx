import { Head } from '@suamox/head';

export const prerender = true;

export default function HomePage() {
  return (
    <div>
      <Head>
        <title>Suamox - Home</title>
        <meta name="description" content="Suamox example home page." />
      </Head>
      <h1>Welcome to Suamox</h1>
      <p>A meta-framework with SSR/SSG and filesystem routing.</p>
    </div>
  );
}
