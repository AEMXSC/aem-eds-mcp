#!/usr/bin/env node

/*
 * pre-completion-check.js
 *
 * Independent pre-completion gate for Step 15. Run BEFORE announcing "Nav migration complete."
 * Mirrors the hook's style-register + mobile-style-register checks so the LLM cannot mark
 * components "validated" with lastSimilarity < 95% and then send the completion message.
 *
 * Usage:
 *   node scripts/pre-completion-check.js
 *   node scripts/pre-completion-check.js [--validation-dir=blocks/header/navigation-validation]
 *   node scripts/pre-completion-check.js /path/to/workspace
 *
 * Exit codes:
 *   0 = All conditions pass — safe to announce completion.
 *   1 = One or more conditions fail — show "Doing a final validation..." and continue fixing.
 *   2 = Phase-4 or validation dir missing (Step 15 not yet applicable).
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const VAL_DIR = path.resolve(ROOT, 'blocks/header/navigation-validation');

const DESKTOP_KEY_IDS = ['key-critique-top-bar-desktop', 'key-critique-nav-links-row-desktop'];
const MOBILE_KEY_IDS = ['key-critique-mobile-header-bar', 'key-critique-mobile-menu-root-panel'];
const SIMILARITY_THRESHOLD = 95;

const issues = [];

function debugLog(validationDir, level, msg) {
  const ts = new Date().toISOString();
  const prefix = { ERROR: '❌', PASS: '✅', BLOCK: '🚫', START: '🔵' }[level] || 'ℹ️';
  const entry = `[${ts}] ${prefix} [SCRIPT:pre-completion-check] [${level}] ${msg}\n`;
  try {
    if (validationDir && fs.existsSync(validationDir)) {
      fs.appendFileSync(path.join(validationDir, 'debug.log'), entry);
    }
  } catch (_) { /* ignore */ }
}

function checkRegister(filePath, keyIds, label, workspaceRoot) {
  const root = workspaceRoot || ROOT;
  if (!fs.existsSync(filePath)) {
    issues.push(`${label}: register file missing — ${filePath}`);
    return;
  }
  let register;
  try {
    register = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    issues.push(`${label}: cannot parse — ${e.message}`);
    return;
  }
  if (!register.allValidated) {
    issues.push(`${label}: allValidated is false`);
  }
  const components = register.components || [];
  for (const keyId of keyIds) {
    const entry = components.find((c) => c.id === keyId);
    if (!entry) {
      issues.push(`${label}: key component "${keyId}" not found in register`);
      continue;
    }
    if (entry.status !== 'validated') {
      issues.push(`${label}: "${keyId}" status="${entry.status}" — must be "validated"`);
    }
    if (typeof entry.lastSimilarity === 'number' && entry.lastSimilarity < SIMILARITY_THRESHOLD) {
      issues.push(`${label}: "${keyId}" lastSimilarity=${entry.lastSimilarity}% — must be >= ${SIMILARITY_THRESHOLD}%`);
    }
    const proofFields = ['critiqueReportPath', 'screenshotSourcePath', 'screenshotMigratedPath'];
    for (const field of proofFields) {
      if (!entry[field]) {
        issues.push(`${label}: "${keyId}" missing ${field}`);
      } else {
        const fullPath = path.isAbsolute(entry[field]) ? entry[field] : path.join(root, entry[field]);
        if (!fs.existsSync(fullPath)) {
          issues.push(`${label}: "${keyId}" ${field} file not found — ${entry[field]}`);
        }
      }
    }
    if (!entry.critiqueIterations || entry.critiqueIterations < 1) {
      issues.push(`${label}: "${keyId}" critiqueIterations must be >= 1`);
    }
  }
}

// Optional: --validation-dir or workspace root arg
const args = process.argv.slice(2);
let workspaceRoot = ROOT;
for (const a of args) {
  if (a.startsWith('--validation-dir=')) {
    // Override VAL_DIR if needed (we already use ROOT-relative path; could resolve differently)
  } else if (!a.startsWith('--') && fs.existsSync(a)) {
    workspaceRoot = path.resolve(a);
    break;
  }
}
const useRoot = workspaceRoot !== ROOT ? workspaceRoot : ROOT;
const useValDir = workspaceRoot !== ROOT ? path.join(workspaceRoot, 'blocks/header/navigation-validation') : VAL_DIR;

debugLog(useValDir, 'START', `pre-completion-check.js — root=${useRoot}`);

if (!fs.existsSync(useValDir)) {
  console.error('pre-completion-check: validation dir not found. Step 15 runs only after mobile is complete.');
  debugLog(useValDir, 'BLOCK', 'validation dir missing');
  process.exit(2);
}

if (!fs.existsSync(path.join(useValDir, 'phase-4-mobile.json'))) {
  console.error('pre-completion-check: phase-4-mobile.json not found. Step 15 runs only after mobile is complete.');
  debugLog(useValDir, 'BLOCK', 'phase-4-mobile.json missing');
  process.exit(2);
}

checkRegister(path.join(useValDir, 'style-register.json'), DESKTOP_KEY_IDS, 'Desktop style', useRoot);
checkRegister(path.join(useValDir, 'mobile', 'mobile-style-register.json'), MOBILE_KEY_IDS, 'Mobile style', useRoot);

if (issues.length > 0) {
  console.error('❌ PRE-COMPLETION CHECK FAILED — DO NOT send completion message.\n');
  console.error('Show user: "Doing a final validation..."\n');
  console.error(`${issues.length} issue(s):`);
  issues.forEach((issue, i) => console.error(`  ${i + 1}. ${issue}`));
  debugLog(useValDir, 'BLOCK', `FAILED — ${issues.length} issue(s)`);
  process.exit(1);
}

console.log('✅ PRE-COMPLETION CHECK PASSED — safe to send completion message.');
debugLog(useValDir, 'PASS', 'All conditions pass — safe to announce completion');
process.exit(0);
