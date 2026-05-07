# Audit Scanners

Re-runnable static-analysis scripts produced during the 2026-05-07 audit pass.

## Usage

From repo root:

```bash
node scripts/audit/dead-refs.cjs       # Find <Component> usages with no definition or import
node scripts/audit/unused-imports.cjs  # Find named imports not referenced in file body
node scripts/audit/hardcoded-strings.cjs  # Find JSX text content with English strings (i18n prep)
```

## Limitations

These are regex-based, not AST-based. Known false positives:

- Default imports may be flagged as unused when JSX uses them
- Aliased imports (`{ X as Y }`) need manual cross-check
- Side-effect imports (`import './styles.css'`) may be flagged
- JSX attribute strings, template literals, and inline style strings are not in scope of `hardcoded-strings.cjs`

For high-confidence audits, cross-check against `grep -c '\bIdentifier\b' file` before acting on findings.

## History

Findings from this run live on branch `audit/static-pass-2026-05-07` in `audit-findings-2026-05-07.md`.
