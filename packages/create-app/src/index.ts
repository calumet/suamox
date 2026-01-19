import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const usage = `
create-suamox <project-name>
`;

const templateRoot = fileURLToPath(new URL('../template', import.meta.url));

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
};

const ensureEmptyDir = async (targetDir: string): Promise<void> => {
  if (!(await isDirectory(targetDir))) {
    await mkdir(targetDir, { recursive: true });
    return;
  }
  const entries = await readdir(targetDir);
  if (entries.length > 0) {
    console.error(`[create-suamox] Target directory is not empty: ${targetDir}`);
    process.exit(1);
  }
};

const copyTemplate = async (srcDir: string, destDir: string, name: string): Promise<void> => {
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = resolve(srcDir, entry.name);
    const destPath = resolve(destDir, entry.name);
    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyTemplate(srcPath, destPath, name);
      continue;
    }
    const content = await readFile(srcPath, 'utf-8');
    const output = content.replace(/__NAME__/g, name);
    await writeFile(destPath, output);
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  const name = args[0];
  if (!name) {
    console.log(usage.trim());
    process.exit(1);
  }

  const targetDir = resolve(process.cwd(), name);
  await ensureEmptyDir(targetDir);
  await copyTemplate(templateRoot, targetDir, name);

  console.log(`Suamox app created at ${targetDir}`);
  console.log(`Next steps:`);
  console.log(`  cd ${name}`);
  console.log(`  pnpm install`);
  console.log(`  pnpm run dev`);
};

void main();
