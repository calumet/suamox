import { hydrateRoot } from 'react-dom/client';
import { createPageElement, matchRoute } from '@suamox/ssr-runtime';
import { routes } from 'virtual:pages';

const rootElement = document.getElementById('root');

if (rootElement) {
  const match = matchRoute(routes, window.location.pathname);
  if (match) {
    const initialData =
      (window as Window & { __INITIAL_DATA__?: unknown }).__INITIAL_DATA__ ?? null;
    const element = createPageElement(match.route, initialData);
    hydrateRoot(rootElement, element);
  }
}
