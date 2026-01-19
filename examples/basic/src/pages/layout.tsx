import { Head } from '@suamox/head';
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Head>
        <meta name="theme-color" content="#0f172a" />
      </Head>
      <header style={{ borderBottom: '1px solid #e2e8f0', padding: '1.5rem 2rem' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>Suamox</div>
        <nav style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
          <a href="/">Home</a>
          <a href="/blog">Blog</a>
          <a href="/counter">Counter</a>
          <a href="/dashboard">Dashboard</a>
        </nav>
      </header>
      <main style={{ flex: 1, padding: '2rem' }}>{children}</main>
      <footer style={{ borderTop: '1px solid #e2e8f0', padding: '1.25rem 2rem' }}>
        <small>Suamox example layout</small>
      </footer>
    </div>
  );
}
