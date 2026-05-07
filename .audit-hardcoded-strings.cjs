const fs = require('fs');
const path = require('path');

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* walk(path.join(dir, e.name));
    else if (/\.jsx$/.test(e.name)) yield path.join(dir, e.name);
  }
}

// Captures JSX text content between > and <, no expressions.
// We look for runs that:
//   - contain only ASCII printable
//   - have at least 3 word characters separated by spaces
//   - are not inside a `placeholder=` attribute (handled by skipping <input ... />)
//
// This is deliberately approximate — false positives are listed for human review,
// not auto-fixed.

const findings = [];

for (const file of walk('src')) {
  const src = fs.readFileSync(file, 'utf8');
  // Skip files that are clearly not user-facing
  if (/DesignSystem\.jsx$|main\.jsx$/.test(file)) continue;

  // Iterate JSX text nodes via a coarse pattern: `>TEXT<` where TEXT contains
  // no `{` or `}` and no other `<` or `>`. This catches `<h1>Hello world</h1>`,
  // `>Add patient<`, etc. Rejects `>{t.foo}<`, `> {var} <` etc.
  const re = />([^<>{}\n\r]+)</g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const text = m[1].trim();
    if (!text) continue;
    // Pure ASCII English filter: must be printable ASCII only
    if (/[^\x20-\x7E]/.test(text)) continue;
    // At least 3 word tokens of >=2 chars (3+ words)
    const words = text.match(/[A-Za-z][A-Za-z']+/g) || [];
    if (words.length < 3) continue;
    // Skip if mostly punctuation or numbers
    const wordChars = words.join('').length;
    if (wordChars < text.length * 0.5) continue;
    // Skip pure CSS-like / numeric content
    if (/^[\d\s.\-px%,]+$/.test(text)) continue;
    // Locate file:line
    const upTo = src.slice(0, m.index);
    const line = upTo.split('\n').length;
    findings.push({ file: file.split(path.sep).join('/'), line, text });
  }
}

// Group by file, dedupe identical text within same file
const grouped = new Map();
for (const f of findings) {
  const k = f.file;
  if (!grouped.has(k)) grouped.set(k, []);
  grouped.get(k).push(f);
}

let total = 0;
for (const [file, list] of [...grouped.entries()].sort()) {
  const seen = new Set();
  const uniq = [];
  for (const f of list) {
    const key = f.text;
    if (!seen.has(key)) { seen.add(key); uniq.push(f); }
  }
  if (uniq.length === 0) continue;
  console.log(`${file}: ${uniq.length} unique`);
  for (const f of uniq.slice(0, 5)) {
    console.log(`  L${f.line}: ${f.text.slice(0, 80)}`);
  }
  if (uniq.length > 5) console.log(`  ... (+${uniq.length - 5} more)`);
  total += uniq.length;
}
console.log('\nTOTAL unique hardcoded English strings:', total);
