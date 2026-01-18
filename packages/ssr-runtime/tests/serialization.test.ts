import { describe, it, expect } from 'vitest';
import { serializeData, generateHTML } from '../src/index';

describe('serializeData', () => {
  it('should serialize simple object', () => {
    const data = { name: 'John', age: 30 };
    const result = serializeData(data);

    expect(result).toBe('{"name":"John","age":30}');
  });

  it('should escape < to prevent XSS', () => {
    const data = { html: '<script>alert("xss")</script>' };
    const result = serializeData(data);

    expect(result).toContain('\\u003cscript');
    expect(result).not.toContain('<script');
  });

  it('should escape > to prevent XSS', () => {
    const data = { html: '<script>alert("xss")</script>' };
    const result = serializeData(data);

    expect(result).toContain('\\u003e');
    expect(result).not.toContain('</script>');
  });

  it('should escape & to prevent XSS', () => {
    const data = { text: 'Tom & Jerry' };
    const result = serializeData(data);

    expect(result).toContain('\\u0026');
    expect(result).not.toContain('&');
  });

  it('should preserve quotes in JSON safely', () => {
    const data = { text: "It's working" };
    const result = serializeData(data);

    // JSON strings are already properly escaped by JSON.stringify
    // Single quotes don't need escaping in JSON
    expect(result).toBe('{"text":"It\'s working"}');
  });

  it('should handle nested objects', () => {
    const data = {
      user: {
        name: 'John',
        profile: {
          bio: '<p>Hello</p>',
        },
      },
    };
    const result = serializeData(data);

    expect(result).toContain('\\u003cp\\u003e');
    expect(result).not.toContain('<p>');
  });

  it('should handle arrays', () => {
    const data = { tags: ['<script>', 'safe', 'test'] };
    const result = serializeData(data);

    expect(result).toContain('\\u003cscript\\u003e');
    expect(result).toContain('safe');
  });

  it('should handle null values', () => {
    const data = { value: null };
    const result = serializeData(data);

    expect(result).toBe('{"value":null}');
  });

  it('should handle undefined values', () => {
    const data = { value: undefined };
    const result = serializeData(data);

    expect(result).toBe('{}');
  });

  it('should handle numbers', () => {
    const data = { count: 42, price: 19.99 };
    const result = serializeData(data);

    expect(result).toBe('{"count":42,"price":19.99}');
  });

  it('should handle booleans', () => {
    const data = { active: true, deleted: false };
    const result = serializeData(data);

    expect(result).toBe('{"active":true,"deleted":false}');
  });

  it('should prevent script injection in JSON', () => {
    const data = { code: '</script><script>alert("xss")</script>' };
    const result = serializeData(data);

    expect(result).not.toContain('</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('\\u003c/script\\u003e');
  });
});

describe('generateHTML', () => {
  it('should generate basic HTML structure', () => {
    const html = generateHTML({
      html: '<div>Content</div>',
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<div>Content</div>');
    expect(html).toContain('</html>');
  });

  it('should include charset and viewport meta tags', () => {
    const html = generateHTML({
      html: '<div>Content</div>',
    });

    expect(html).toContain('<meta charset="UTF-8">');
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    );
  });

  it('should include custom head content', () => {
    const html = generateHTML({
      html: '<div>Content</div>',
      head: '<title>My Page</title>',
    });

    expect(html).toContain('<title>My Page</title>');
  });

  it('should serialize initial data safely', () => {
    const html = generateHTML({
      html: '<div>Content</div>',
      initialData: { message: '<script>alert("xss")</script>' },
    });

    expect(html).toContain('window.__INITIAL_DATA__');
    expect(html).toContain('\\u003cscript');
    expect(html).not.toContain('<script>alert("xss")');
  });

  it('should handle null initial data', () => {
    const html = generateHTML({
      html: '<div>Content</div>',
      initialData: undefined,
    });

    expect(html).toContain('window.__INITIAL_DATA__ = null');
  });

  it('should include script tags', () => {
    const html = generateHTML({
      html: '<div>Content</div>',
      scripts: ['/assets/main.js', '/assets/vendor.js'],
    });

    expect(html).toContain('<script type="module" src="/assets/main.js"></script>');
    expect(html).toContain('<script type="module" src="/assets/vendor.js"></script>');
  });

  it('should handle no scripts', () => {
    const html = generateHTML({
      html: '<div>Content</div>',
    });

    expect(html).not.toContain('<script type="module"');
    expect(html).toContain('window.__INITIAL_DATA__');
  });

  it('should allow skipping initial data script', () => {
    const html = generateHTML({
      html: '<div>Content</div>',
      includeInitialDataScript: false,
    });

    expect(html).not.toContain('window.__INITIAL_DATA__');
  });

  it('should place initial data before external scripts', () => {
    const html = generateHTML({
      html: '<div id="root"></div>',
      initialData: { loaded: true },
      scripts: ['/app.js'],
    });

    const dataIndex = html.indexOf('window.__INITIAL_DATA__');
    const scriptIndex = html.indexOf('<script type="module" src="/app.js">');

    expect(dataIndex).toBeLessThan(scriptIndex);
  });

  it('should handle complex initial data', () => {
    const html = generateHTML({
      html: '<div>Content</div>',
      initialData: {
        user: { name: 'John', email: 'john@example.com' },
        posts: [
          { id: 1, title: 'First' },
          { id: 2, title: 'Second' },
        ],
        settings: { theme: 'dark', notifications: true },
      },
    });

    expect(html).toContain('window.__INITIAL_DATA__');
    expect(html).toContain('John');
    expect(html).toContain('john@example.com');
  });

  it('should escape HTML entities in initial data', () => {
    const html = generateHTML({
      html: '<div>Content</div>',
      initialData: {
        dangerous: '<img src=x onerror="alert(1)">',
        script: '</script><script>alert(2)</script>',
      },
    });

    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('</script><script>');
    expect(html).toContain('\\u003c');
    expect(html).toContain('\\u003e');
  });

  it('should create valid HTML structure', () => {
    const html = generateHTML({
      html: '<div id="root"><h1>Hello</h1></div>',
      head: '<title>Test</title>',
      initialData: { test: true },
      scripts: ['/main.js'],
    });

    expect(html).toMatch(/<!DOCTYPE html>/);
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<head>/);
    expect(html).toMatch(/<\/head>/);
    expect(html).toMatch(/<body>/);
    expect(html).toMatch(/<\/body>/);
    expect(html).toMatch(/<\/html>/);
  });
});
