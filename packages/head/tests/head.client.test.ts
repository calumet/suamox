/// <reference lib="dom" />
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Head,
  HeadProvider,
  headMarkerAttribute,
  headMarkerEndValue,
  headMarkerStartValue,
} from '../src/index';

describe('Head (client)', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    document.head.innerHTML = '';
  });

  it('applies head elements on the client', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          HeadProvider,
          null,
          createElement(
            Fragment,
            null,
            createElement(Head, null, createElement('title', null, 'Client Title')),
            createElement(
              Head,
              null,
              createElement('meta', { name: 'description', content: 'CSR' })
            ),
            createElement('main', null, 'App')
          )
        )
      );
      await Promise.resolve();
    });

    const title = document.head.querySelector('title');
    const meta = document.head.querySelector('meta[name="description"]');
    const start = document.head.querySelector(
      `meta[${headMarkerAttribute}="${headMarkerStartValue}"]`
    );
    const end = document.head.querySelector(`meta[${headMarkerAttribute}="${headMarkerEndValue}"]`);

    expect(title?.textContent).toBe('Client Title');
    expect(meta?.getAttribute('content')).toBe('CSR');
    expect(start).not.toBeNull();
    expect(end).not.toBeNull();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
  });
});
