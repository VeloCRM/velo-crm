const fs = require('fs');
const path = require('path');

const REACT_BUILTINS = new Set(['Suspense', 'Fragment', 'StrictMode', 'Profiler']);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* walk(path.join(dir, e.name));
    else if (/\.(jsx|tsx|js|ts)$/.test(e.name)) yield path.join(dir, e.name);
  }
}

const issues = [];

for (const file of walk('src')) {
  const src = fs.readFileSync(file, 'utf8');

  // JSX usages: capture <Foo or <Foo.Bar (root only)
  const calls = [...src.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map(m => m[1]);

  // Local definitions
  const defs = new Set([
    ...[...src.matchAll(/\bfunction\s+([A-Z][A-Za-z0-9]*)/g)].map(m => m[1]),
    ...[...src.matchAll(/\bconst\s+([A-Z][A-Za-z0-9]*)\s*=/g)].map(m => m[1]),
    ...[...src.matchAll(/\blet\s+([A-Z][A-Za-z0-9]*)\s*=/g)].map(m => m[1]),
    ...[...src.matchAll(/\bclass\s+([A-Z][A-Za-z0-9]*)/g)].map(m => m[1]),
    // destructure rename: { foo: Foo = ... } or { foo: Foo, ... } or { foo: Foo }
    ...[...src.matchAll(/[a-z_$][a-z0-9_$]*\s*:\s*([A-Z][A-Za-z0-9]*)\s*[=,}]/gi)].map(m => m[1]),
  ]);

  // Imports — strip side-effect `import 'path'` lines and comments first, then
  // match line-anchored standard imports (allowing multi-line `{ ... }` braces).
  const imports = new Set();
  // Strip side-effect imports only — block-comment stripping is unsafe (see
  // .audit-unused-imports.cjs for rationale). The line-anchored import regex
  // below handles the "imports inside doc-comments" false-positive on its own.
  const stripped = src.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
  const importLineRe = /^\s*import\s+([\s\S]+?)\s+from\s+['"][^'"]+['"]/gm;
  for (const m of stripped.matchAll(importLineRe)) {
    const clause = m[1].trim();
    // default: `X` or `X, { Y }` or `X, * as Z`
    const def = clause.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:,|$)/);
    if (def) imports.add(def[1]);
    // namespace: `* as X`
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (ns) imports.add(ns[1]);
    // named: `{ X, Y as Z }`
    const nb = clause.match(/{([^}]+)}/);
    if (nb) {
      for (const seg of nb[1].split(',')) {
        const t = seg.trim();
        if (!t) continue;
        const aliased = t.match(/^[A-Za-z_$][A-Za-z0-9_$]*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
        imports.add(aliased ? aliased[1] : t);
      }
    }
  }

  const known = new Set([...defs, ...imports, ...REACT_BUILTINS]);
  const dead = [...new Set(calls)].filter(c => !known.has(c));
  if (dead.length > 0) issues.push({ file, dead, defs, imports });
}

if (issues.length === 0) {
  console.log('Clean — no dead component references found.');
} else {
  for (const { file, dead } of issues) {
    console.log(file.split(path.sep).join('/') + ':');
    for (const d of dead) console.log('  ' + d);
  }
}
