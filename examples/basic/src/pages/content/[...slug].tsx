import { useLoaderData } from "@calumet/suamox";
import type { LoaderContext } from "@calumet/suamox";
import { Head } from "@calumet/suamox-head";

const pages: Record<string, string> = {
  about: "<h2>About Us</h2><p>We are a team.</p>",
  contact: "<h2>Contact</h2><p>Email us.</p>",
};

export function loader({ params }: LoaderContext) {
  const slug = params.slug;
  const html = pages[slug] ?? "";
  return { html, slug, found: slug in pages };
}

function ContentHeader() {
  const { slug } = useLoaderData<{ slug: string }>();
  return <div data-testid="content-header">Viewing: {slug}</div>;
}

function ContentFooter() {
  const { found } = useLoaderData<{ found: boolean }>();
  return <div data-testid="content-footer">{found ? "Page exists" : "Page not found"}</div>;
}

export default function ContentPage() {
  const { html, found } = useLoaderData<{ html: string; found: boolean }>();

  return (
    <div>
      <Head>
        <title>{found ? "Content" : "Not Found"}</title>
      </Head>
      <ContentHeader />
      {found ? (
        <div data-testid="content-body" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div data-testid="content-body">
          <h1>Page not found</h1>
        </div>
      )}
      <ContentFooter />
    </div>
  );
}
