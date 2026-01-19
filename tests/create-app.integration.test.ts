import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const isWindows = process.platform === 'win32';
const pnpmCmd = 'pnpm';

const run = (
  command: string,
  args: string[],
  cwd: string,
  options: { shell?: boolean } = {}
) =>
  new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd,
      shell: options.shell ?? false,
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code && code !== 0) {
        rejectPromise(new Error(`${command} exited with code ${code}`));
        return;
      }
      resolvePromise();
    });
  });

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf-8')) as T;

describe('create-app integration', () => {
  it('creates a project from GitHub and installs dependencies', async () => {
    const repoRoot = process.cwd();
    const testRoot = resolve(repoRoot, 'tests', '.tmp');
    const appName = `suamox-app-${Date.now()}`;
    const appDir = resolve(testRoot, appName);

    await mkdir(testRoot, { recursive: true });

    try {
      const source = process.env.SUAMOX_DLX_SOURCE ?? 'local';
      if (source === 'github') {
        await run(
          pnpmCmd,
          ['dlx', 'github:calumet/suamox#main', appName],
          testRoot,
          { shell: isWindows }
        );
      } else {
        const cliPath = resolve(repoRoot, 'bin', 'create-suamox.js');
        await run(process.execPath, [cliPath, appName], testRoot);
      }

      type PackageJson = {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        pnpm?: { overrides?: Record<string, string> };
      };
      const appPackagePath = resolve(appDir, 'package.json');
      const appPackageJson = await readJson<PackageJson>(appPackagePath);
      const deps = appPackageJson.dependencies ?? {};
      const devDeps = appPackageJson.devDependencies ?? {};
      const overrides = appPackageJson.pnpm?.overrides;

      const requiredDeps = [
        '@suamox/head',
        '@suamox/hono-adapter',
        '@suamox/router',
        '@suamox/ssr-runtime',
        '@suamox/vite-plugin-pages',
      ];

      for (const name of requiredDeps) {
        expect(deps[name]).toMatch('github:calumet/suamox#path:');
      }

      expect(devDeps['@suamox/cli']).toMatch('github:calumet/suamox#path:');
      expect(overrides).toBeDefined();

      const requiredOverrides: Record<string, string> = {
        '@suamox/cli': 'github:calumet/suamox#path:packages/cli',
        '@suamox/head': 'github:calumet/suamox#path:packages/head',
        '@suamox/hono-adapter': 'github:calumet/suamox#path:packages/hono-adapter',
        '@suamox/router': 'github:calumet/suamox#path:packages/router',
        '@suamox/ssr-runtime': 'github:calumet/suamox#path:packages/ssr-runtime',
        '@suamox/vite-plugin-pages': 'github:calumet/suamox#path:packages/vite-plugin-pages',
      };

      for (const [name, value] of Object.entries(requiredOverrides)) {
        expect(overrides?.[name]).toBe(value);
      }

      await run(pnpmCmd, ['install', '--ignore-workspace'], appDir, {
        shell: isWindows,
      });
      await access(resolve(appDir, 'pnpm-lock.yaml'));
      await access(resolve(appDir, 'node_modules', '@suamox', 'ssr-runtime'));
      await access(resolve(appDir, 'node_modules', '@suamox', 'cli'));
      await rm(appDir, { recursive: true, force: true });
    } catch (error) {
      console.error('[integration-test] Failed:', error);
      console.error(`[integration-test] App directory kept at ${appDir}`);
      throw error;
    }
  });
});
