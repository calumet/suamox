import { Head } from '@suamox/head';

export const prerender = true;

export default function HomePage() {
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <Head>
        <title>Suamox</title>
        <meta name="description" content="Suamox starter." />
      </Head>
      <h1>Suamox</h1>
      <p>Meta-framework with SSR, SSG, and filesystem routing.</p>
    </div>
  );
}
