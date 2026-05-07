const fs = require('fs');
const path = require('path');

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* walk(path.join(dir, e.name));
    else if (/\.(jsx|tsx|js|ts)$/.test(e.name)) yield path.join(dir, e.name);
  }
}

const issues = [];

for (const file of walk('src')) {
  const src = fs.readFileSync(file, 'utf8');

  // Strip side-effect imports first
  const stripped = src.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');

  // No block-comment stripping: regex-only comment removal is fundamentally
  // unsafe (string literals like `accept="image/*"` look identical to `/*`).
  // The line-anchored import regex below already prevents the original
  // "imports inside doc-comments" false-positive — `^\s*import` only matches
  // when `import` is the first non-whitespace token on the line.

  // Body = stripped source minus all import statements (so we can grep usage).
  const body = stripped.replace(/^\s*import\s+[\s\S]+?\s+from\s+['"][^'"]+['"];?/gm, '');

  // Line-anchored: match only when 'import' starts a line.
  for (const m of stripped.matchAll(/^\s*import\s+([\s\S]+?)\s+from\s+['"]([^'"]+)['"]/gm)) {
    const clause = m[1].trim();
    const source = m[2];
    const bindings = []; // { name, kind, originalText }

    // Default
    const def = clause.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:,|$)/);
    if (def) bindings.push({ name: def[1], kind: 'default' });

    // Namespace
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (ns) bindings.push({ name: ns[1], kind: 'namespace' });

    // Named bindings
    const nb = clause.match(/{([^}]+)}/);
    if (nb) {
      for (const seg of nb[1].split(',')) {
        const t = seg.trim();
        if (!t) continue;
        const aliased = t.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
        if (aliased) bindings.push({ name: aliased[2], kind: 'aliased', original: aliased[1] });
        else bindings.push({ name: t, kind: 'named' });
      }
    }

    // Test usage in body — must appear as identifier (word boundary)
    for (const b of bindings) {
      const re = new RegExp('\\b' + b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
      if (!re.test(body)) {
        issues.push({ file, name: b.name, kind: b.kind, source, original: b.original });
      }
    }
  }
}

if (issues.length === 0) {
  console.log('Clean — no unused imports found.');
} else {
  for (const { file, name, kind, source, original } of issues) {
    const fp = file.split(path.sep).join('/');
    const label = kind === 'aliased' ? `${original} as ${name}` : name;
    console.log(`${fp}: ${label} (${kind}) from ${source}`);
  }
}
