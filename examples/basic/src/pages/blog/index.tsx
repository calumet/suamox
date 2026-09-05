import { Head } from "@calumet/suamox-head";

import "./blog.css";

export const prerender = true;

export default function BlogIndexPage() {
  return (
    <div>
      <Head>
        <title>Suamox - Blog</title>
        <meta name="description" content="Blog index example." />
      </Head>
      <h1 className="blog-index-marker">Blog</h1>
      <p>Welcome to the blog.</p>
    </div>
  );
}
