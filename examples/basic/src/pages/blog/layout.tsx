import { Head } from '@suamox/head';
import type { ReactNode } from 'react';

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <section>
      <Head>
        <meta name="section" content="blog" />
      </Head>
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Blog</p>
        <p style={{ margin: '0.25rem 0 0', color: '#475569' }}>
          Thoughts about Suamox and SSR.
        </p>
      </div>
      {children}
    </section>
  );
}
