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

const files = walk('src');

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
        || f.includes(join('server', 'evidence'))
        || f.includes(join('server', 'page-data.ts'));
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
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'));
    expect(offenders).toEqual([]);
  });

  it('never logs with console.log', () => {
    const offenders = files.filter((f) => /\bconsole\.log\s*\(/.test(readFileSync(f, 'utf8')));
    expect(offenders, `console.log in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('keeps every request-path server module server-only', () => {
    // schema.ts is read by drizzle-kit and migrate.ts is a CLI entry point; neither runs
    // in a request, and both are loaded by tools that do not apply the react-server
    // condition, so the guard would break them.
    const buildTimeOnly = [join('server', 'db', 'schema.ts'), join('server', 'db', 'migrate.ts')];
    const offenders: string[] = [];
    for (const f of files) {
      if (!f.startsWith(join('src', 'server'))) continue;
      if (buildTimeOnly.some((b) => f.endsWith(b))) continue;
      const src = readFileSync(f, 'utf8');
      if (!src.includes("import 'server-only'")) offenders.push(f);
    }
    expect(offenders, `missing the server-only guard: ${offenders.join(', ')}`).toEqual([]);
  });

  it('decrypts personal data in only the places that are allowed to', () => {
    const allowed = [
      join('server', 'crypto', 'pii.ts'),
      join('server', 'records', 'prepare.ts'),   // decrypts in order to mask
      join('server', 'export', 'excel.ts'),      // the official export
      join('api', 'admin', 'reveal'),            // the audited reveal route
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
      if (!f.includes(join('src', 'app', 'api'))) continue;
      if (f.includes(join('api', 'health'))) continue;     // deliberately public and bodyless
      const src = readFileSync(f, 'utf8');
      const declaresBareHandler = /export\s+(async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/.test(src);
      if (declaresBareHandler) offenders.push(f);
    }
    expect(offenders, `bare route handlers (must use withRoute): ${offenders.join(', ')}`).toEqual([]);
  });
});
