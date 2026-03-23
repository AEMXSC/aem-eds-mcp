#!/usr/bin/env node

/*
 * compare-header-appearance.js
 *
 * Compares source header-appearance-mapping.json vs migrated-header-appearance-mapping.json.
 * Produces header-appearance-register.json with match status for header bar appearance changes
 * on hover/click (background, shadow, border when nav items hovered or panel open).
 *
 * Usage:
 *   node scripts/compare-header-appearance.js <source-mapping> <migrated-mapping> [--output=<register-path>]
 *
 * Example:
 *   node scripts/compare-header-appearance.js \
 *     blocks/header/navigation-validation/header-appearance-mapping.json \
 *     blocks/header/navigation-validation/migrated-header-appearance-mapping.json \
 *     --output=blocks/header/navigation-validation/header-appearance-register.json
 *
 * Exit codes:
 *   0 = match (or both haveChanges=false)
 *   1 = mismatch
 *   2 = usage error
 */

import fs from 'fs';
import path from 'path';

function debugLog(level, msg) {
  const ts = new Date().toISOString();
  const prefix = { ERROR: '❌', PASS: '✅', BLOCK: '🚫', START: '🔵', END: '🏁' }[level] || 'ℹ️';
  const entry = `[${ts}] ${prefix} [SCRIPT:compare-header-appearance] [${level}] ${msg}\n`;
  try {
    const logDir = path.resolve('blocks/header/navigation-validation');
    if (fs.existsSync(logDir)) fs.appendFileSync(path.join(logDir, 'debug.log'), entry);
  } catch (_) { /* ignore */ }
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`Failed to load ${filePath}: ${e.message}`);
    return null;
  }
}

function compareTriggers(sourceTriggers, migratedTriggers) {
  if (!sourceTriggers || sourceTriggers.length === 0) return { matches: true, delta: null };
  if (!migratedTriggers || migratedTriggers.length === 0) {
    return { matches: false, delta: 'Source has header appearance triggers but migrated has none' };
  }
  const srcCount = sourceTriggers.length;
  const migCount = migratedTriggers.length;
  if (srcCount !== migCount) {
    return { matches: false, delta: `Trigger count mismatch: source=${srcCount} migrated=${migCount}` };
  }
  for (let i = 0; i < srcCount; i++) {
    const s = sourceTriggers[i];
    const m = migratedTriggers.find(t => t.trigger === s.trigger && t.effect === s.effect);
    if (!m) {
      return { matches: false, delta: `Trigger "${s.trigger}" / "${s.effect}" missing in migrated` };
    }
    if ((s.description || '').toLowerCase() !== (m.description || '').toLowerCase()) {
      return { matches: false, delta: `Trigger "${s.trigger}" description differs: source="${s.description}" migrated="${m.description}"` };
    }
  }
  return { matches: true, delta: null };
}

function compareAppearance(sourceApp, migratedApp, label) {
  if (!sourceApp && !migratedApp) return { matches: true, delta: null };
  if (!sourceApp) return { matches: true, delta: null };
  if (!migratedApp) return { matches: false, delta: `Migrated missing ${label}` };
  const issues = [];
  for (const key of ['background', 'shadow', 'border']) {
    const s = (sourceApp[key] || '').toString().trim().toLowerCase();
    const m = (migratedApp[key] || '').toString().trim().toLowerCase();
    if (s && m && s !== m) issues.push(`${key}: source="${sourceApp[key]}" migrated="${migratedApp[key]}"`);
  }
  return {
    matches: issues.length === 0,
    delta: issues.length > 0 ? issues.join('; ') : null
  };
}

function compareHeaderBackgroundBehavior(sourceHbb, migratedHbb) {
  if (!sourceHbb && !migratedHbb) return { matches: true, delta: null };
  if (!sourceHbb) return { matches: true, delta: null };
  if (!migratedHbb) return { matches: false, delta: 'Migrated missing headerBackgroundBehavior' };
  const issues = [];
  const keys = ['defaultState', 'interactionState'];
  for (const key of keys) {
    const s = (sourceHbb[key] || '').toString().trim();
    const m = (migratedHbb[key] || '').toString().trim();
    if (s && m && s !== m) issues.push(`headerBackgroundBehavior.${key}: source="${s}" migrated="${m}"`);
  }
  if (sourceHbb.textColorInversion !== migratedHbb.textColorInversion) {
    issues.push(`headerBackgroundBehavior.textColorInversion: source=${sourceHbb.textColorInversion} migrated=${migratedHbb.textColorInversion}`);
  }
  if (sourceHbb.requiresBodyPaddingTop !== migratedHbb.requiresBodyPaddingTop) {
    issues.push(`headerBackgroundBehavior.requiresBodyPaddingTop: source=${sourceHbb.requiresBodyPaddingTop} migrated=${migratedHbb.requiresBodyPaddingTop}`);
  }
  return {
    matches: issues.length === 0,
    delta: issues.length > 0 ? issues.join('; ') : null
  };
}

function main() {
  const args = process.argv.slice(2);
  let outputPath = null;
  const positional = [];
  for (const arg of args) {
    if (arg.startsWith('--output=')) {
      outputPath = arg.split('=')[1];
    } else {
      positional.push(arg);
    }
  }

  if (positional.length < 2) {
    console.error('Usage: node compare-header-appearance.js <source-mapping> <migrated-mapping> [--output=<path>]');
    process.exit(2);
  }

  const sourcePath = positional[0];
  const migratedPath = positional[1];

  if (!fs.existsSync(sourcePath)) {
    console.error(`Source mapping not found: ${sourcePath}`);
    process.exit(2);
  }
  if (!fs.existsSync(migratedPath)) {
    console.error(`Migrated mapping not found: ${migratedPath}`);
    process.exit(2);
  }

  const source = loadJson(sourcePath);
  const migrated = loadJson(migratedPath);
  if (!source || !migrated) process.exit(2);

  debugLog('START', `compare-header-appearance.js — source=${sourcePath}, migrated=${migratedPath}, output=${outputPath || 'stdout'}`);

  const hasChangesMatch = source.hasChanges === migrated.hasChanges;
  const triggersMatch = compareTriggers(source.triggers || [], migrated.triggers || []);
  const defaultMatch = compareAppearance(source.defaultAppearance, migrated.defaultAppearance, 'defaultAppearance');
  const onInteractionMatch = (source.hasChanges && migrated.hasChanges)
    ? compareAppearance(source.onInteractionAppearance, migrated.onInteractionAppearance, 'onInteractionAppearance')
    : { matches: true, delta: null };
  const headerBackgroundBehaviorMatch = compareHeaderBackgroundBehavior(
    source.headerBackgroundBehavior,
    migrated.headerBackgroundBehavior
  );

  const allMatch = hasChangesMatch && triggersMatch.matches && defaultMatch.matches && onInteractionMatch.matches && headerBackgroundBehaviorMatch.matches;

  const register = {
    hasChangesMatch,
    triggersMatch: triggersMatch.matches,
    defaultAppearanceMatch: defaultMatch.matches,
    onInteractionAppearanceMatch: onInteractionMatch.matches,
    headerBackgroundBehaviorMatch: headerBackgroundBehaviorMatch.matches,
    allValidated: allMatch,
    issues: []
  };

  if (!hasChangesMatch) register.issues.push(`hasChanges: source=${source.hasChanges} migrated=${migrated.hasChanges}`);
  if (!triggersMatch.matches) register.issues.push(triggersMatch.delta);
  if (!defaultMatch.matches) register.issues.push(`defaultAppearance: ${defaultMatch.delta}`);
  if (!onInteractionMatch.matches) register.issues.push(`onInteractionAppearance: ${onInteractionMatch.delta}`);
  if (!headerBackgroundBehaviorMatch.matches) register.issues.push(`headerBackgroundBehavior: ${headerBackgroundBehaviorMatch.delta}`);

  console.log('=== Header Appearance Comparison ===');
  console.log(`hasChanges: source=${source.hasChanges} migrated=${migrated.hasChanges} ${hasChangesMatch ? '✓' : '✗'}`);
  console.log(`triggers: ${triggersMatch.matches ? 'match' : 'mismatch'}`);
  console.log(`defaultAppearance: ${defaultMatch.matches ? 'match' : 'mismatch'}`);
  console.log(`onInteractionAppearance: ${onInteractionMatch.matches ? 'match' : 'mismatch'}`);
  console.log(`headerBackgroundBehavior: ${headerBackgroundBehaviorMatch.matches ? 'match' : 'mismatch'}`);
  console.log(`\n=== ${allMatch ? 'VALIDATED' : 'VALIDATION FAILED'} ===`);

  if (register.issues.length > 0) {
    console.log('\nIssues:');
    register.issues.forEach(i => console.log(`  - ${i}`));
  }

  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(register, null, 2));
    console.log(`\nRegister written to: ${outputPath}`);
  }

  if (allMatch) {
    debugLog('PASS', 'Header appearance validated — source and migrated match');
  } else {
    debugLog('BLOCK', `Header appearance FAILED — ${register.issues.join('; ')}`);
  }
  process.exit(allMatch ? 0 : 1);
}

main();
