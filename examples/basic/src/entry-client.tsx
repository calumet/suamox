import { createRoot, hydrateRoot } from 'react-dom/client';
import { hydrateApp } from '@suamox/ssr-runtime';
import { routes } from 'virtual:pages';

void hydrateApp(routes, { hydrateRoot, createRoot });
