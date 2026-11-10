#!/usr/bin/env node
/**
 * Runs `npm audit --omit=dev --json` and fails (non-zero exit) only if it finds a vulnerable
 * package NOT already listed in audit-baseline.json — i.e. a genuinely NEW production-path
 * finding, not one of the already-known, already-triaged ones this pass deliberately didn't fix
 * (see that file's own description for why). This is what lets CI "fail on any new high or
 * critical production-path vulnerability" (the production-hardening plan's own Phase 1
 * instruction) without also failing permanently on day one over debt that's tracked, not hidden.
 *
 * Usage: node scripts/audit-guard.js [path-to-baseline-json]
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const baselinePath = process.argv[2] || path.join(__dirname, '..', 'audit-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const accepted = new Set(baseline.acceptedPackages || []);

let auditOutput;
try {
  auditOutput = execSync('npm audit --omit=dev --json', { encoding: 'utf8' });
} catch (err) {
  // npm audit exits non-zero whenever ANY vulnerability exists, even an already-accepted one —
  // that's expected and not itself a failure here; the real result is still in stdout.
  auditOutput = err.stdout;
}

const result = JSON.parse(auditOutput);
const found = Object.keys(result.vulnerabilities || {});
const newFindings = found.filter((name) => !accepted.has(name));

if (newFindings.length > 0) {
  console.error('audit-guard: NEW production-path vulnerability finding(s), not in the accepted baseline:');
  for (const name of newFindings) {
    const v = result.vulnerabilities[name];
    console.error(`  - ${name} (severity: ${v.severity})`);
  }
  console.error(`\nIf this is a real new finding: fix it, or — only after deliberately triaging it as deferred like the rest of ${path.basename(baselinePath)} — add it to acceptedPackages with a reason.`);
  process.exit(1);
}

console.log(`audit-guard: no new production-path vulnerabilities (${found.length} already-known finding(s) in baseline, 0 new).`);
process.exit(0);
