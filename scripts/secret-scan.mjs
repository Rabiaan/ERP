import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd());
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'coverage', 'storage']);
const SKIP_FILES = new Set(['secret-scan.mjs']);
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FINDINGS = 100;
const PATTERNS = [
  [
    'database DSN',
    /postgres(?:ql)?:\/\/[\w.-]+:[\w!@$%^&*()+=-]{8,}@[\w.-]+(?::\d+)?\/[\w-]+/g,
  ],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['OpenAI key', /sk-(?:proj-)?[A-Za-z0-9]{20,}/g],
  ['AWS access key', /AKIA[0-9A-Z]{16}/g],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/g],
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  [
    'literal secret',
    /\b(?:APP_SECRET|KMS_LOCAL_KEY|PLATFORM_APP_PASSWORD|PLATFORM_MIGRATOR_PASSWORD|PLATFORM_ADMIN_URL|PLATFORM_DATABASE_URL|PROVISIONING_DATABASE_URL)\s*[:=]\s*["']([^"'$]{8,})["']/g,
  ],
];

async function* walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) yield* walk(fullPath);
      continue;
    }
    if (entry.isFile()) yield fullPath;
  }
}

async function main() {
  const findings = [];
  let scanned = 0;

  for await (const filePath of walk(ROOT)) {
    const name = filePath.split(sep).pop() ?? '';
    if (SKIP_FILES.has(name) || !TEXT_EXTENSIONS.has(extname(filePath).toLowerCase())) {
      continue;
    }

    let contents;
    try {
      contents = await readFile(filePath);
    } catch {
      continue;
    }
    if (contents.length === 0 || contents.length > MAX_FILE_BYTES || contents.includes(0)) {
      continue;
    }

    scanned += 1;
    const text = contents.toString('utf8');
    const displayPath = relative(ROOT, filePath).split(sep).join('/');

    for (const [label, pattern] of PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split('\n').length;
        findings.push(`${displayPath}:${line} ${label}`);
      }
    }
  }

  if (findings.length > 0) {
    console.error(`Secret scan failed with ${findings.length} finding(s):`);
    for (const finding of findings.slice(0, MAX_FINDINGS)) console.error(`- ${finding}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Secret scan clean: ${scanned} files scanned.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Secret scan failed: ${message}`);
  process.exitCode = 1;
});
