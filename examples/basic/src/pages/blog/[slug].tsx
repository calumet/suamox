import type { LoaderContext } from '@suamox/ssr-runtime';

// Simulated blog posts database
const blogPosts = {
  'hello-world': {
    title: 'Hello World',
    content: 'This is my first blog post!',
    date: '2026-01-15',
  },
  'react-ssr': {
    title: 'React Server-Side Rendering',
    content: 'Learn how SSR works with React and Vite.',
    date: '2026-01-16',
  },
  'suamox-framework': {
    title: 'Introducing Suamox Framework',
    content: 'A modern meta-framework for React with SSR and SSG support.',
    date: '2026-01-18',
  },
};

export function loader({ params }: LoaderContext) {
  const { slug } = params;
  const post = blogPosts[slug as keyof typeof blogPosts];

  if (!post) {
    return { notFound: true };
  }

  return { post, slug };
}

interface BlogPostData {
  post?: {
    title: string;
    content: string;
    date: string;
  };
  slug?: string;
  notFound?: boolean;
}

export default function BlogPostPage({ data }: { data: BlogPostData | null }) {
  if (!data || data.notFound) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>Post Not Found</h1>
        <p>The blog post you're looking for doesn't exist.</p>
        <a href="/">Back to home</a>
      </div>
    );
  }

  const { post } = data;

  if (!post) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>Error</h1>
        <p>Unable to load post data.</p>
        <a href="/">Back to home</a>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <article>
        <header>
          <h1>{post.title}</h1>
          <time style={{ color: '#666' }}>{post.date}</time>
        </header>
        <div style={{ marginTop: '2rem', lineHeight: '1.6' }}>
          <p>{post.content}</p>
        </div>
      </article>
      <footer style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #eee' }}>
        <a href="/">← Back to home</a>
      </footer>
    </div>
  );
}
