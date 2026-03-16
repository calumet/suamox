import { useStaticProps } from "@calumet/suamox";
import { Head } from "@calumet/suamox-head";

export const prerender = true;

export function getStaticPaths() {
  return [{ params: {}, props: { greeting: "Hello from static props!", build: "2026-01-01" } }];
}

export default function StaticPropsPage() {
  const { greeting, build } = useStaticProps<{ greeting: string; build: string }>();

  return (
    <div>
      <Head>
        <title>Static Props Test</title>
      </Head>
      <h1>Static Props Test</h1>
      <p data-testid="greeting">{greeting}</p>
      <p data-testid="build">{build}</p>
    </div>
  );
}
