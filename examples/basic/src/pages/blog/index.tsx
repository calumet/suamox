import { Head } from '@suamox/head';

export const prerender = true;

export default function BlogIndexPage() {
  return (
    <div>
      <Head>
        <title>Suamox - Blog</title>
        <meta name="description" content="Blog index example." />
      </Head>
      <h1>Blog</h1>
      <p>Welcome to the blog.</p>
    </div>
  );
}
