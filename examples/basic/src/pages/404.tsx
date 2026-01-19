import { Head } from '@suamox/head';

export default function NotFoundPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <Head>
        <title>Suamox - 404</title>
        <meta name="description" content="Page not found." />
      </Head>
      <h1>404 - Page Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <a href="/">Back to home</a>
    </div>
  );
}
