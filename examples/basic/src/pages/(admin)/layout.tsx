import { Head } from '@suamox/head';
import type { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem' }}>
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ marginBottom: '1rem' }}>
        <strong>Admin</strong>
        <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>Internal section layout</p>
      </div>
      {children}
    </section>
  );
}
