import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runSsg } from '@suamox/ssr-runtime/ssg';

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const readPackageVersion = (): string => {
  const packageJsonPath = new URL('../package.json', import.meta.url);
  const raw = readFileSync(packageJsonPath, 'utf-8');
  const parsed = JSON.parse(raw) as { version?: string };
  return parsed.version ?? '0.0.0';
};

const usage = `
suamox <command>

Commands:
  dev       Run dev server (tsx server.ts)
  build     Build client + server + SSG
  ssg       Run SSG only
  preview   Run production server (NODE_ENV=production)
  version   Print CLI version
  help      Show this help
`;

const run = async (command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}) => {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, ...options.env },
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code && code !== 0) {
        const exitCode = String(code ?? 'unknown');
        rejectPromise(new Error(`${command} exited with code ${exitCode}`));
        return;
      }
      resolvePromise();
    });
  });
};

const ensureFile = (filePath: string, label: string): void => {
  if (!existsSync(filePath)) {
    console.error(`[suamox] Missing ${label} at ${filePath}`);
    process.exit(1);
  }
};

const runVite = async (args: string[]) => {
  await run(pnpmCmd, ['exec', 'vite', ...args]);
};

const runTsx = async (args: string[], env?: NodeJS.ProcessEnv) => {
  await run(pnpmCmd, ['exec', 'tsx', ...args], { env });
};

const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'help';

  switch (command) {
    case 'version': {
      console.log(readPackageVersion());
      return;
    }
    case 'help': {
      console.log(usage.trim());
      return;
    }
    case 'dev': {
      const serverPath = resolve(process.cwd(), 'server.ts');
      ensureFile(serverPath, 'server.ts');
      await runTsx(['server.ts']);
      return;
    }
    case 'preview': {
      const serverPath = resolve(process.cwd(), 'server.ts');
      ensureFile(serverPath, 'server.ts');
      await runTsx(['server.ts'], { NODE_ENV: 'production' });
      return;
    }
    case 'ssg': {
      await runSsg();
      return;
    }
    case 'build': {
      await runVite(['build']);
      await runVite(['build', '--ssr', 'src/entry-server.tsx', '--outDir', 'dist/server']);
      await runSsg();
      return;
    }
    default: {
      console.error(`[suamox] Unknown command: ${command}`);
      console.log(usage.trim());
      process.exit(1);
    }
  }
};

void main();
