import { describe, expect, it } from 'vitest';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { Head, HeadProvider, createHeadManager } from '../src/index';

describe('Head (server)', () => {
  it('collects head elements during SSR', () => {
    const manager = createHeadManager('server');
    const element = createElement(
      HeadProvider,
      { manager },
      createElement(
        Fragment,
        null,
        createElement(Head, null, createElement('title', null, 'Server Title')),
        createElement(Head, null, createElement('meta', { name: 'description', content: 'SSR' })),
        createElement('div', null, 'App')
      )
    );

    renderToString(element);

    const headHtml = manager
      .getSnapshot()
      .map((node) => renderToStaticMarkup(createElement(Fragment, null, node)))
      .join('\n');

    expect(headHtml).toContain('<title>Server Title</title>');
    expect(headHtml).toMatch(/<meta name="description" content="SSR"\s*\/?>/);
  });
});
