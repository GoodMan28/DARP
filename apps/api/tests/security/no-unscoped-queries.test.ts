import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

// Run from apps/api. The API's own source, plus the other tiers for the checks that apply
// everywhere (no raw HTML injection, no console.log).
const files = walk('src');
const webFiles = walk(join('..', 'web', 'src'));
const sharedFiles = walk(join('..', '..', 'packages', 'shared', 'src'));
const everyTier = [...files, ...webFiles, ...sharedFiles];

describe('no unscoped record access', () => {
  it('never selects from records outside the service, rollups and export layers', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (f.includes(join('records', 'scope.ts'))) continue;
      const src = readFileSync(f, 'utf8');
      const touchesRecords = /\.from\(\s*records\s*\)/.test(src);
      const allowed = f.includes(join('server', 'records'))
        || f.includes(join('server', 'rollups'))
        || f.includes(join('server', 'export'))
        || f.includes(join('server', 'evidence'));
      if (touchesRecords && !allowed) offenders.push(f);
    }
    expect(offenders, `these files query records directly: ${offenders.join(', ')}`).toEqual([]);
  });

  it('applies scopeFilter in every file that queries records', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (f.includes(join('records', 'scope.ts'))) continue;
      const src = readFileSync(f, 'utf8');
      if (!/\.from\(\s*records\s*\)/.test(src)) continue;
      // Either it calls scopeFilter itself, or it builds on one that does.
      if (!/scopeFilter|scopedModulesFilter/.test(src)) offenders.push(f);
    }
    expect(offenders, `these files query records without a scope filter: ${offenders.join(', ')}`).toEqual([]);
  });

  it('never uses raw SQL string interpolation', () => {
    const offenders = files.filter((f) => /sql\.raw\(|execute\(`[^`]*\$\{/.test(readFileSync(f, 'utf8')));
    expect(offenders, `raw SQL interpolation in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('never uses dangerouslySetInnerHTML', () => {
    const offenders = everyTier.filter((f) => readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'));
    expect(offenders).toEqual([]);
  });

  it('never logs with console.log', () => {
    const offenders = everyTier.filter((f) => /\bconsole\.log\s*\(/.test(readFileSync(f, 'utf8')));
    expect(offenders, `console.log in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('keeps the web tier away from the database, the keys and the API internals', () => {
    // The tier boundary: everything sensitive lives in the API process. The web tier may
    // only reach data over HTTP, so it must never import a database driver, the password
    // hasher or the API's source, nor read a secret from its environment.
    const forbiddenImport = /from\s+['"](pg|drizzle-orm[^'"]*|@node-rs\/argon2|@darp\/api[^'"]*|[^'"]*apps\/api[^'"]*)['"]/;
    const forbiddenEnv = /process\.env\.(DATABASE_URL\w*|PII_ENCRYPTION_KEY|SESSION_SECRET|APP_DB_PASSWORD|SMTP_PASS)\b/;
    const offenders = webFiles.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return forbiddenImport.test(src) || forbiddenEnv.test(src);
    });
    expect(offenders, `web files crossing the tier boundary: ${offenders.join(', ')}`).toEqual([]);

    const webPackage = JSON.parse(readFileSync(join('..', 'web', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(webPackage.dependencies ?? {});
    expect(deps.filter((d) => ['pg', 'drizzle-orm', '@node-rs/argon2', '@darp/api'].includes(d))).toEqual([]);
  });

  it('decrypts personal data in only the places that are allowed to', () => {
    const allowed = [
      join('server', 'crypto', 'pii.ts'),
      join('server', 'records', 'prepare.ts'),   // decrypts in order to mask
      join('server', 'export', 'excel.ts'),      // the official export
      join('routes', 'admin', 'reveal'),         // the audited reveal route
    ];
    const offenders = files.filter((f) => {
      if (allowed.some((a) => f.includes(a))) return false;
      return /\bdecryptPii\s*\(/.test(readFileSync(f, 'utf8'));
    });
    expect(offenders, `decryptPii called in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('routes every API handler through withRoute', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (!f.includes(join('src', 'routes'))) continue;
      if (f.endsWith(join('routes', 'index.ts'))) continue;   // the route table itself
      if (f.endsWith(join('routes', 'health.ts'))) continue;  // deliberately public and bodyless
      const src = readFileSync(f, 'utf8');
      const bareFunction = /export\s+(async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/.test(src);
      const handlerNames = [...src.matchAll(/export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\b([^=]*)=\s*(\w+)/g)];
      const notWrapped = handlerNames.some((m) => m[3] !== 'withRoute');
      if (bareFunction || notWrapped) offenders.push(f);
    }
    expect(offenders, `bare route handlers (must use withRoute): ${offenders.join(', ')}`).toEqual([]);
  });

  it('registers every route module in the route table', () => {
    // A handler file that is never mounted is dead code that looks like a live endpoint.
    const table = readFileSync(join('src', 'routes', 'index.ts'), 'utf8');
    const unmounted = files
      .filter((f) => f.includes(join('src', 'routes')) && !f.endsWith(join('routes', 'index.ts')))
      .map((f) => f.split(join('src', 'routes'))[1]!.replace(/\\/g, '/').replace(/^\//, './').replace(/\.ts$/, ''))
      .filter((rel) => !table.includes(`from '${rel}'`));
    expect(unmounted, `route modules not in routes/index.ts: ${unmounted.join(', ')}`).toEqual([]);
  });
});
