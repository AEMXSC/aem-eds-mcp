#!/usr/bin/env node

/*
 * Navigation Validation Gate Hook (Table-Driven)
 *
 * Enforces navigation orchestrator requirements via hard programmatic gates.
 * Registered on PostToolUse (Write|Edit) and Stop events in plugin.json.
 *
 * PostToolUse gates are defined in nav-validation-gates/gate-table.js.
 * Stop checks remain in handleStop below.
 *
 * LOGGING: Writes to BOTH /tmp (always) and workspace debug.log (when session exists).
 * Check: blocks/header/navigation-validation/debug.log for full execution trace.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  VALIDATION_DIR,
  ROW_DETECTION_MARKER,
  STYLE_REGISTER,
  SCHEMA_REGISTER,
  MEGAMENU_BEHAVIOR_REGISTER,
  ROW_ELEMENTS_BEHAVIOR_REGISTER,
  MOBILE_DIR,
  MOBILE_HEADING_COVERAGE,
  MOBILE_STRUCTURE_DETECTION_MARKER,
  AGGREGATE,
  DEBUG_LOG,
  SIMILARITY_THRESHOLD,
  blockReason,
  loadJson,
  hasRowElements,
  hasMegamenu,
  detectPhase,
} from './nav-validation-gates/helpers.js';
import {
  checkNavContentForImages,
  checkImageAudit,
  checkRowLandmarkParity,
  checkImageManifestParity,
  checkFeatureCardCompleteness,
  checkHeaderHeightSanity,
  checkStyleRegister,
  checkSchemaRegister,
  checkMegamenuBehaviorRegister,
  checkMobileRegisters,
  checkMobileCritiqueProof,
  checkMobileDimensionalGate,
  checkHamburgerAnimation,
  checkMobileBehaviorRegister,
  checkMobileAnimationSpeed,
  checkMissingContentRegister,
  checkMobileMissingContentRegister,
  checkPanelLayoutMeasuredValues,
  checkRowElementsBehaviorRegisterShortcutNotes,
} from './nav-validation-gates/checks.js';
import { buildContext, runPostToolUseGates, POST_TOOL_USE_GATES } from './nav-validation-gates/gate-table.js';
import { logWorkflowProgress } from './nav-validation-gates/workflow-progress.js';
import { isHeaderFile, isNavContentFile, isNavValidationFile, getNavFilePath } from './nav-validation-gates/helpers.js';

let sessionId = 'default';
let TMP_LOG = path.join(os.tmpdir(), 'excat-nav-gate-debug-default.log');
let workspaceDebugLog = null;
const hookStartTime = Date.now();

function initSession(hookInput) {
  sessionId = hookInput?.session_id || 'default';
  TMP_LOG = path.join(os.tmpdir(), `excat-nav-gate-debug-${sessionId}.log`);
}

function log(level, msg, data = null) {
  const ts = new Date().toISOString();
  const elapsed = Date.now() - hookStartTime;
  const prefix = { ERROR: '❌', BLOCK: '🚫', WARN: '⚠️', PASS: '✅', START: '🔵', END: '🏁' }[level] || 'ℹ️';
  const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : '';
  const entry = `[${ts}] (+${elapsed}ms) ${prefix} [${level}] ${msg}${dataStr}\n`;
  try { fs.appendFileSync(TMP_LOG, entry); } catch (_) { /* ignore */ }
  if (workspaceDebugLog) {
    try { fs.appendFileSync(workspaceDebugLog, entry); } catch (_) { /* ignore */ }
  }
}

function initWorkspaceLog(workspaceRoot) {
  const logDir = path.join(workspaceRoot, VALIDATION_DIR);
  if (fs.existsSync(logDir)) {
    workspaceDebugLog = path.join(workspaceRoot, DEBUG_LOG);
  }
}

function logDecision(decision, summary) {
  const elapsed = Date.now() - hookStartTime;
  log('END', `Hook decision: ${decision.toUpperCase()} — ${summary} (elapsed: ${elapsed}ms)`);
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
      catch (e) { reject(new Error(`Failed to parse stdin: ${e.message}`)); }
    });
    process.stdin.on('error', reject);
  });
}

function findWorkspaceRoot(startPath) {
  let cur = path.resolve(startPath);
  const root = path.parse(cur).root;
  const cwd = process.cwd();
  let check = cur;
  while (check !== root) {
    if (fs.existsSync(path.join(check, '.git'))) return check;
    const parent = path.dirname(check);
    if (parent === check) break;
    check = parent;
  }
  check = cur;
  while (check !== root) {
    if (fs.existsSync(path.join(check, 'blocks'))) return check;
    const parent = path.dirname(check);
    if (parent === check) break;
    check = parent;
  }
  return cwd;
}

// --- PostToolUse handler (table-driven) ---
function handlePostToolUse(hookInput) {
  const filePath = hookInput?.tool_input?.file_path;
  const toolName = hookInput?.tool_name || 'unknown';
  if (!filePath) {
    log('INFO', `PostToolUse: no file_path in input (tool=${toolName}) — skipping`);
    console.log(JSON.stringify({ reason: 'No file path in tool input.' }));
    return;
  }

  const workspaceRoot = findWorkspaceRoot(path.dirname(filePath));
  initWorkspaceLog(workspaceRoot);
  const relPath = path.relative(workspaceRoot, filePath);
  log('START', `PostToolUse triggered — tool=${toolName}, file=${relPath}`, {
    absolutePath: filePath,
    workspaceRoot,
    isNavContent: isNavContentFile(filePath),
    isHeader: isHeaderFile(filePath),
  });

  if (isHeaderFile(filePath) || isNavContentFile(filePath) || isNavValidationFile(filePath)) {
    logWorkflowProgress(workspaceRoot, log);
  }

  const ctx = buildContext(hookInput);
  ctx.filePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
  const result = runPostToolUseGates(ctx, POST_TOOL_USE_GATES, log);

  if (result.decision === 'block') {
    logDecision('block', result.reason?.slice(0, 80) || 'Gate blocked');
    console.log(JSON.stringify({ decision: 'block', reason: blockReason(result.reason) }));
    return;
  }
  if (result.decision === 'warn') {
    logDecision('warn', result.reason?.slice(0, 80) || 'Gate warning');
    console.log(JSON.stringify({ decision: 'warn', reason: result.reason }));
    return;
  }

  const phase = detectPhase(workspaceRoot);
  log('PASS', `[${phase}] All gates passed for: ${relPath}`);
  logDecision('allow', `[${phase}] ${path.basename(filePath)} passed all gates`);
  console.log(JSON.stringify({
    success: true,
    action: 'checked',
    file: filePath,
    message: `Nav gate [${phase}]: ${path.basename(filePath)} passed.`
  }));
}

// --- Stop handler ---
function handleStop(hookInput) {
  const workspaceRoot = hookInput?.tool_input?.file_path
    ? findWorkspaceRoot(path.dirname(hookInput.tool_input.file_path))
    : process.cwd();

  initWorkspaceLog(workspaceRoot);
  log('START', '=== STOP EVENT — Final validation gate ===', { workspaceRoot });
  logWorkflowProgress(workspaceRoot, log);

  const sessionFile = path.join(workspaceRoot, VALIDATION_DIR, 'session.json');
  if (!fs.existsSync(sessionFile)) {
    log('INFO', 'No session.json found — not a nav orchestrator run, skipping gate');
    logDecision('allow', 'No nav session — gate not applicable');
    console.log(JSON.stringify({ reason: 'No nav orchestrator session. Gate skipped.' }));
    return;
  }
  log('INFO', 'session.json found — running full validation gate');

  const allErrors = [];
  let allRemediation = [];

  log('INFO', 'Stop check: row detection script...');
  const phase1Path = path.join(workspaceRoot, VALIDATION_DIR, 'phase-1-row-detection.json');
  const rowDetectionMarkerPath = path.join(workspaceRoot, VALIDATION_DIR, ROW_DETECTION_MARKER);
  if (fs.existsSync(phase1Path) && !fs.existsSync(rowDetectionMarkerPath)) {
    allErrors.push('phase-1-row-detection.json exists but detect-header-rows.js has NOT been run. Run: node scripts/detect-header-rows.js --url=<source-url> — programmatic row detection is mandatory; never set rowCount from screenshot alone.');
    log('INFO', '[ROW-DETECTION] .row-detection-complete missing — detect-header-rows.js not run');
  }

  log('INFO', 'Stop check: header height sanity + row landmark parity...');
  const heightSanityErr = checkHeaderHeightSanity(workspaceRoot);
  if (heightSanityErr) {
    allErrors.push(heightSanityErr);
    log('INFO', '[HEADER-HEIGHT-SANITY] heightMismatch — likely missed row');
  }
  const rowParityErr = checkRowLandmarkParity(workspaceRoot);
  if (rowParityErr) {
    allErrors.push(rowParityErr);
    log('INFO', '[ROW-LANDMARK-PARITY] phase-2 row count < phase-1');
  }

  log('INFO', 'Stop check: image manifest parity (source vs migrated)...');
  const imageParityErr = checkImageManifestParity(workspaceRoot);
  if (imageParityErr) {
    allErrors.push(imageParityErr);
    log('INFO', '[IMAGE-PARITY] manifest compare not run or failed');
  }

  log('INFO', 'Stop check: feature card completeness...');
  const featureCardErr = checkFeatureCardCompleteness(workspaceRoot);
  if (featureCardErr) {
    allErrors.push(featureCardErr);
    log('INFO', '[FEATURE-CARD] megamenu has no featureCards but source has bgImages');
  }

  log('INFO', 'Stop check: nav location + content...');
  const navFilePath = getNavFilePath(workspaceRoot);
  if (!navFilePath) {
    const navMdAtRoot = path.join(workspaceRoot, 'nav.md');
    const navMdInContent = path.join(workspaceRoot, 'content', 'nav.md');
    if (fs.existsSync(navMdAtRoot) || fs.existsSync(navMdInContent)) {
      allErrors.push('nav.md is not supported. Create content/nav.plain.html instead. header.js fetches /nav.plain.html.');
      log('INFO', '[NAV] nav.md found — not supported, use nav.plain.html');
    } else {
      allErrors.push('content/nav.plain.html does not exist.');
      log('INFO', '[NAV] content/nav.plain.html missing');
    }
  }

  if (navFilePath) {
    const imgError = checkNavContentForImages(navFilePath, workspaceRoot);
    if (imgError) {
      allErrors.push(imgError);
      log('INFO', '[NAV-CONTENT] Image validation failed', { msg: imgError.slice(0, 150) });
    }
    const navValidatedPath = path.join(workspaceRoot, VALIDATION_DIR, '.nav-content-validated');
    if (!fs.existsSync(navValidatedPath)) {
      const navBasename = path.basename(navFilePath);
      allErrors.push(`${path.relative(workspaceRoot, navFilePath)} exists but validate-nav-content.js has NOT been run. Run: node scripts/validate-nav-content.js content/${navBasename} blocks/header/navigation-validation — validates image existence and size > 0.`);
      log('INFO', '[NAV-CONTENT] .nav-content-validated missing — validate-nav-content.js not run');
    }
    log('INFO', 'Stop check: image audit (expected vs actual header images)...');
    const imageAuditError = checkImageAudit(workspaceRoot);
    if (imageAuditError) {
      allErrors.push(imageAuditError);
      log('INFO', '[IMAGE-AUDIT] Image audit failed or not run', { msg: imageAuditError.slice(0, 150) });
    }
  }

  log('INFO', 'Stop check: missing-content-register...');
  const missingContentResult = checkMissingContentRegister(workspaceRoot);
  if (missingContentResult.errors.length > 0) {
    log('INFO', `[MISSING-CONTENT] ${missingContentResult.errors.length} unresolved omission(s)`, missingContentResult.errors);
    allErrors.push(...missingContentResult.errors);
    allRemediation.push(...(missingContentResult.remediation || []));
  }

  // style-register is built at Step 13 (with mobile-style-register) — only required when phase-4 exists (full flow)
  const phase4PathForStop = path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json');
  let styleResult = { errors: [], remediation: [] };
  if (fs.existsSync(phase4PathForStop)) {
    log('INFO', 'Stop check: style-register...');
    styleResult = checkStyleRegister(workspaceRoot);
    if (styleResult.errors.length > 0) {
      log('INFO', `[STYLE-REGISTER] ${styleResult.errors.length} error(s)`, styleResult.errors);
      if (styleResult.remediation?.length) log('INFO', `[STYLE-REGISTER] Remediation (style prompt): ${styleResult.remediation.length} item(s)`, styleResult.remediation);
    }
    allErrors.push(...styleResult.errors);
  }

  log('INFO', 'Stop check: schema-register...');
  const schemaResult = checkSchemaRegister(workspaceRoot);
  if (schemaResult.errors.length > 0) {
    log('INFO', `[SCHEMA-REGISTER] ${schemaResult.errors.length} error(s)`, schemaResult.errors);
    if (schemaResult.remediation?.length) log('INFO', `[SCHEMA-REGISTER] Remediation: ${schemaResult.remediation.length} item(s)`, schemaResult.remediation);
  }
  allErrors.push(...schemaResult.errors);

  log('INFO', 'Stop check: megamenu-behavior-register...');
  const megamenuResult = checkMegamenuBehaviorRegister(workspaceRoot);
  if (megamenuResult.errors.length > 0) {
    log('INFO', `[MEGAMENU-BEHAVIOR] ${megamenuResult.errors.length} error(s)`, megamenuResult.errors);
    if (megamenuResult.remediation?.length) log('INFO', `[MEGAMENU-BEHAVIOR] Remediation (style prompt): ${megamenuResult.remediation.length} item(s)`, megamenuResult.remediation);
  }
  allErrors.push(...megamenuResult.errors);
  allRemediation = [...(styleResult.remediation || []), ...(schemaResult.remediation || []), ...(megamenuResult.remediation || [])];

  if (hasRowElements(workspaceRoot)) {
    log('INFO', 'Stop check: row-elements-behavior-register...');
    const rowRegPath = path.join(workspaceRoot, ROW_ELEMENTS_BEHAVIOR_REGISTER);
    if (!fs.existsSync(rowRegPath)) {
      allErrors.push('row-elements-behavior-register.json does NOT exist. Create row-elements-mapping.json and migrated-row-elements-mapping.json, then run compare-row-elements-behavior.js.');
      log('INFO', '[ROW-ELEMENTS] Register missing — row-elements-mapping + migrated required, then compare-row-elements-behavior.js');
    } else {
      const rowReg = loadJson(rowRegPath);
      if (!rowReg || !rowReg.allValidated) {
        allErrors.push('row-elements-behavior-register.json allValidated is not true.');
        const failed = (rowReg?.items || []).filter(i => i.status !== 'validated');
        log('INFO', `[ROW-ELEMENTS] allValidated=false — ${failed.length} failed item(s)`, failed.map(i => `${i.id}: ${i.remediation || 'no remediation'}`));
      }
      const rowShortcutResult = checkRowElementsBehaviorRegisterShortcutNotes(workspaceRoot);
      if (!rowShortcutResult.pass) {
        for (const s of rowShortcutResult.shortcutItems) {
          allErrors.push(`Row elements behavior: "${s.id}" (${s.label}) marked validated but has note describing mismatch — do not shortcut. Fix the implementation to match source; remove the note.`);
        }
        log('INFO', `[ROW-ELEMENTS] Shortcut notes: ${rowShortcutResult.shortcutItems.length} item(s)`, rowShortcutResult.shortcutItems);
      }
    }
  }

  const agg = loadJson(path.join(workspaceRoot, AGGREGATE));
  if (agg) {
    const vr = agg.validationReport || {};
    if (typeof vr.styleSimilarity === 'number' && vr.styleSimilarity < SIMILARITY_THRESHOLD) allErrors.push(`Aggregate styleSimilarity=${vr.styleSimilarity}% — must be >= ${SIMILARITY_THRESHOLD}%.`);
    if (typeof vr.structuralSimilarity === 'number' && vr.structuralSimilarity < SIMILARITY_THRESHOLD) allErrors.push(`Aggregate structuralSimilarity=${vr.structuralSimilarity}% — must be >= ${SIMILARITY_THRESHOLD}%.`);
  }

  const mmPath = path.join(workspaceRoot, VALIDATION_DIR, 'megamenu-mapping.json');
  const p3 = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-3-megamenu.json'));
  if (!fs.existsSync(mmPath) && p3 && p3.columnCount > 0) {
    allErrors.push('megamenu-mapping.json does not exist but megamenu has columns.');
  }

  const migratedMmPath = path.join(workspaceRoot, VALIDATION_DIR, 'migrated-megamenu-mapping.json');
  if (hasMegamenu(workspaceRoot) && !fs.existsSync(migratedMmPath)) {
    allErrors.push('migrated-megamenu-mapping.json does not exist. Hover+click every migrated megamenu item, then run compare-megamenu-behavior.js.');
  }

  log('INFO', 'Stop check: panel-layout-measured-values...');
  const panelLayoutResult = checkPanelLayoutMeasuredValues(workspaceRoot);
  if (panelLayoutResult.errors.length > 0) {
    log('INFO', `[PANEL-LAYOUT] ${panelLayoutResult.errors.length} error(s)`, panelLayoutResult.errors);
    allErrors.push(...panelLayoutResult.errors);
    allRemediation.push(...(panelLayoutResult.remediation || []));
  }

  log('INFO', 'Stop check: header-appearance (postponed until post-implementation)...');
  const headerAppearanceSourcePath = path.join(workspaceRoot, VALIDATION_DIR, 'header-appearance-mapping.json');
  const migratedHeaderAppearancePath = path.join(workspaceRoot, VALIDATION_DIR, 'migrated-header-appearance-mapping.json');
  const headerAppearanceRegPath = path.join(workspaceRoot, VALIDATION_DIR, 'header-appearance-register.json');
  const migratedRowElementsPath = path.join(workspaceRoot, VALIDATION_DIR, 'migrated-row-elements-mapping.json');
  const migratedMegamenuPath = path.join(workspaceRoot, VALIDATION_DIR, 'migrated-megamenu-mapping.json');
  const headerAppearancePostImpl = (hasRowElements(workspaceRoot) && fs.existsSync(migratedRowElementsPath)) || (hasMegamenu(workspaceRoot) && fs.existsSync(migratedMegamenuPath));
  if (fs.existsSync(headerAppearanceSourcePath)) {
    if (fs.existsSync(migratedHeaderAppearancePath) && !headerAppearancePostImpl) {
      allErrors.push('migrated-header-appearance-mapping.json was created prematurely. Delete it. Create it only AFTER implementing the desktop header and creating migrated-row-elements-mapping.json (or migrated-megamenu-mapping.json if megamenu).');
      log('INFO', '[HEADER-APPEARANCE] created prematurely — delete until post-implementation');
    } else if (headerAppearancePostImpl) {
      if (!fs.existsSync(migratedHeaderAppearancePath)) {
        allErrors.push('header-appearance-mapping.json exists but migrated-header-appearance-mapping.json does NOT. Test header bar appearance on migrated page (background/shadow on hover/click); create migrated mapping with same schema (including headerBackgroundBehavior).');
        log('INFO', '[HEADER-APPEARANCE] migrated mapping missing — style prompt in troubleshooting');
      } else if (!fs.existsSync(headerAppearanceRegPath)) {
        allErrors.push('migrated-header-appearance-mapping.json exists but compare-header-appearance.js has NOT been run.');
        log('INFO', '[HEADER-APPEARANCE] compare-header-appearance.js not run');
      } else {
        const headerAppReg = loadJson(headerAppearanceRegPath);
        if (!headerAppReg || !headerAppReg.allValidated) {
          allErrors.push('header-appearance-register.json allValidated is not true. Fix header bar appearance (background/shadow on hover, headerBackgroundBehavior) to match source.');
          log('INFO', '[HEADER-APPEARANCE] allValidated=false — extract exact styles from source (troubleshooting)');
        }
      }
    }
  }

  const phase4Path = path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json');
  if (fs.existsSync(phase4Path)) {
    log('INFO', 'Stop check: mobile-structure-detection...');
    const mobileStructureMarker = path.join(workspaceRoot, MOBILE_STRUCTURE_DETECTION_MARKER);
    if (!fs.existsSync(mobileStructureMarker)) {
      allErrors.push('[MOBILE] detect-mobile-structure.js has NOT been run. Run: node scripts/detect-mobile-structure.js --url=<source-url> [--validation-dir=blocks/header/navigation-validation] (viewport 375×812). Same as desktop: programmatic row and item count before mobile structural validation. When mobile has extra images/text not on desktop, add to nav.plain.html in a mobile-only section and mobile missing-content-register.');
    }

    log('INFO', 'Stop check: hamburger-animation...');
    allErrors.push(...checkHamburgerAnimation(workspaceRoot));

    log('INFO', 'Stop check: mobile-registers (schema + style)...');
    const mobileResult = checkMobileRegisters(workspaceRoot);
    if (mobileResult.errors.length > 0) {
      log('INFO', `[MOBILE-REGISTERS] ${mobileResult.errors.length} error(s)`, mobileResult.errors);
      if (mobileResult.remediation?.length) log('INFO', `[MOBILE-REGISTERS] Remediation (style prompt): ${mobileResult.remediation.length} item(s)`, mobileResult.remediation);
    }
    allErrors.push(...mobileResult.errors);
    allRemediation.push(...(mobileResult.remediation || []));

    log('INFO', 'Stop check: mobile-critique-proof...');
    allErrors.push(...checkMobileCritiqueProof(workspaceRoot));

    const p4 = loadJson(phase4Path);
    if (p4?.openBehavior === 'slide-in-panel') {
      const cssPath = path.join(workspaceRoot, 'blocks', 'header', 'header.css');
      if (fs.existsSync(cssPath)) {
        const css = fs.readFileSync(cssPath, 'utf8');
        if (!/translateX/i.test(css)) allErrors.push('[MOBILE] phase-4 specifies openBehavior="slide-in-panel" but header.css has NO translateX.');
      }
      if (!p4.slideInPanelBehavior) allErrors.push('[MOBILE] phase-4 specifies openBehavior="slide-in-panel" but slideInPanelBehavior object is MISSING.');
    }

    const headingCoverage = loadJson(path.join(workspaceRoot, MOBILE_HEADING_COVERAGE));
    if (headingCoverage && !headingCoverage.allCovered) allErrors.push('[MOBILE] mobile-heading-coverage.json: allCovered=false.');
    else if (!headingCoverage) allErrors.push('[MOBILE] mobile-heading-coverage.json does NOT exist.');

    if (p4?.mobileMenuItems && headingCoverage?.headings && p4.mobileMenuItems.length < headingCoverage.headings.length) {
      allErrors.push(`[MOBILE] phase-4 mobileMenuItems has ${p4.mobileMenuItems.length} entries but ${headingCoverage.headings.length} headings were found.`);
    }

    const validWidthLayouts = ['full-width-flush', 'centered-with-margins', 'constrained-max-width', 'unknown'];
    if (p4 && (p4.menuItemsWidthLayout === undefined || p4.menuItemsWidthLayout === '')) {
      allErrors.push('[MOBILE] phase-4-mobile.json missing menuItemsWidthLayout — observe source at mobile viewport: full-width-flush | centered-with-margins | constrained-max-width | unknown. Required so migrated CSS matches (e.g. menu items flush vs centered).');
    } else if (p4 && !validWidthLayouts.includes(p4.menuItemsWidthLayout)) {
      allErrors.push(`[MOBILE] phase-4-mobile.json menuItemsWidthLayout must be one of: ${validWidthLayouts.join(', ')}. Got: ${JSON.stringify(p4.menuItemsWidthLayout)}`);
    } else if (p4?.menuItemsWidthLayout) {
      log('INFO', `[MOBILE] phase-4 menuItemsWidthLayout: ${p4.menuItemsWidthLayout}`, { menuItemsWidthLayout: p4.menuItemsWidthLayout });
    }

    log('INFO', 'Stop check: mobile-missing-content-register...');
    const mobileMissingContentResult = checkMobileMissingContentRegister(workspaceRoot);
    if (mobileMissingContentResult.errors.length > 0) {
      log('INFO', `[MOBILE-MISSING-CONTENT] ${mobileMissingContentResult.errors.length} unresolved omission(s)`, mobileMissingContentResult.errors);
      allErrors.push(...mobileMissingContentResult.errors);
      allRemediation.push(...(mobileMissingContentResult.remediation || []));
    }

    log('INFO', 'Stop check: mobile-behavior-register...');
    const mobileBehaviorResult = checkMobileBehaviorRegister(workspaceRoot);
    if (mobileBehaviorResult.errors.length > 0) {
      log('INFO', `[MOBILE-BEHAVIOR] ${mobileBehaviorResult.errors.length} error(s)`, mobileBehaviorResult.errors);
      if (mobileBehaviorResult.remediation?.length) log('INFO', `[MOBILE-BEHAVIOR] Remediation (style prompt): ${mobileBehaviorResult.remediation.length} item(s)`, mobileBehaviorResult.remediation);
    }
    allErrors.push(...mobileBehaviorResult.errors);
    allRemediation.push(...(mobileBehaviorResult.remediation || []));

    log('INFO', 'Stop check: mobile-dimensional-gate...');
    const mobileDimResult = checkMobileDimensionalGate(workspaceRoot);
    if (mobileDimResult.errors.length > 0) {
      log('INFO', `[MOBILE-DIMENSIONAL-GATE] ${mobileDimResult.errors.length} error(s)`, mobileDimResult.errors);
      if (mobileDimResult.remediation?.length) log('INFO', `[MOBILE-DIMENSIONAL-GATE] Remediation: ${mobileDimResult.remediation.length} item(s)`, mobileDimResult.remediation);
    }
    allErrors.push(...mobileDimResult.errors);
    allRemediation.push(...(mobileDimResult.remediation || []));

    log('INFO', 'Stop check: mobile-animation-speed...');
    allErrors.push(...checkMobileAnimationSpeed(workspaceRoot));

    // style-register: 4 key components must be validated; rest may be "skipped". No "pending" allowed for completion.
    const finalStyleReg = loadJson(path.join(workspaceRoot, STYLE_REGISTER));
    if (finalStyleReg) {
      const components = finalStyleReg.components || [];
      const pending = components.filter(c => c.status === 'pending');
      if (pending.length > 0) allErrors.push(`[DESKTOP] style-register has ${pending.length} component(s) still "pending". Run the 4 key-component critique subagents (Step 14) so the 4 key components are validated; mark non-key as "skipped" if not critiqued.`);
    }
  }

  if (fs.existsSync(phase4Path)) {
    const headerJsPath = path.join(workspaceRoot, 'blocks', 'header', 'header.js');
    if (fs.existsSync(headerJsPath)) {
      try {
        const js = fs.readFileSync(headerJsPath, 'utf8');
        const hasResize = /addEventListener\s*\(\s*['"]resize['"]/i.test(js);
        const hasMM = /matchMedia\s*\(/i.test(js);
        const hasRO = /ResizeObserver/i.test(js);
        const hasOR = /window\.onresize/i.test(js);
        if (!hasResize && !hasMM && !hasRO && !hasOR) {
          allErrors.push('[VIEWPORT] header.js has NO viewport resize / matchMedia handling.');
        }
      } catch (_) { /* ignore */ }
    }
  }

  const p2Stop = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-2-row-mapping.json'));
  const p3Stop = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-3-megamenu.json'));
  const p4Stop = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json'));
  const desktopRowsHaveSearch = (p2Stop?.rows || []).some(r => r.hasSearchForm === true);
  const megamenuHasSearch = p3Stop && (p3Stop.columnCount > 0 || p3Stop.triggerType) && p3Stop.hasSearchForm === true;
  const desktopHasSearch = desktopRowsHaveSearch || megamenuHasSearch;
  const mobileHasSearch = p4Stop && p4Stop.hasSearchForm === true;
  if (p4Stop && desktopHasSearch && !mobileHasSearch && p4Stop.hasSearchForm !== false) {
    allErrors.push('[SEARCH] Desktop has search form but phase-4-mobile.json is missing hasSearchForm field.');
  }

  const desktopRowsHaveLocale = (p2Stop?.rows || []).some(r => r.hasLocaleSelector === true);
  const megamenuHasLocale = p3Stop && (p3Stop.columnCount > 0 || p3Stop.triggerType) && p3Stop.hasLocaleSelector === true;
  const desktopHasLocale = desktopRowsHaveLocale || megamenuHasLocale;
  if (p4Stop && desktopHasLocale && p4Stop.hasLocaleSelector === undefined) {
    allErrors.push('[LOCALE] Desktop header has locale selector but phase-4-mobile.json is missing hasLocaleSelector field.');
  }

  const localeRows = (p2Stop?.rows || []).filter(r => r.hasLocaleSelector === true && r.localeSelectorDetails?.hasFlags === true);
  const megamenuLocaleHasFlags = megamenuHasLocale && p3Stop?.localeSelectorDetails?.hasFlags === true;
  const mobileLocaleHasFlags = p4Stop?.hasLocaleSelector && p4Stop?.localeSelectorDetails?.hasFlags === true;
  const navFileForLocale = getNavFilePath(workspaceRoot);
  if ((localeRows.length > 0 || megamenuLocaleHasFlags || mobileLocaleHasFlags) && navFileForLocale) {
    try {
      const navContent = fs.readFileSync(navFileForLocale, 'utf8');
      if (!/flag|country|locale|lang.*\.(png|jpg|jpeg|svg|webp|gif)/i.test(navContent)) {
        allErrors.push('[LOCALE] Locale selector has flags but nav file contains NO flag image references.');
      }
    } catch (_) { /* ignore */ }
  }

  if (hasMegamenu(workspaceRoot) && p3Stop) {
    const megamenuHasContent = (p3Stop.columnCount > 0) || (p3Stop.triggerType && p3Stop.triggerType !== '') || (p3Stop.nestedLevels > 0);
    if (megamenuHasContent) {
      if (p3Stop.hasSearchForm === undefined) allErrors.push('[MEGAMENU] phase-3-megamenu.json is missing hasSearchForm field.');
      if (p3Stop.hasLocaleSelector === undefined) allErrors.push('[MEGAMENU] phase-3-megamenu.json is missing hasLocaleSelector field.');
    }
  }

  if (allErrors.length > 0) {
    // Audit trail when LLM attempted stop but conditions aren't met (e.g. premature "Nav Migration Complete")
    try {
      const debugLogPath = path.join(workspaceRoot, DEBUG_LOG);
      const logDir = path.dirname(debugLogPath);
      if (fs.existsSync(logDir)) {
        const entry = `[${new Date().toISOString()}] [HOOK:PREMATURE-COMPLETION] Stop attempted with ${allErrors.length} unresolved issue(s). LLM should have run pre-completion-check.js first.\n`;
        fs.appendFileSync(debugLogPath, entry);
      }
    } catch (_) { /* ignore */ }
    log('BLOCK', `Stop gate BLOCKED — ${allErrors.length} issue(s)`, allErrors);
    if (allRemediation.length > 0) {
      log('INFO', `Remediation passed to LLM (${allRemediation.length} item(s), includes style prompt):`, allRemediation);
    }
    let msg = `🚫 [Nav Gate] Cannot stop — ${allErrors.length} issue(s):\n\n` + allErrors.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
    if (allRemediation.length > 0) {
      msg += '\n\n=== REQUIRED REMEDIATION — DO THIS NOW ===\n\n' +
        allRemediation.map((r, i) => `  ${i + 1}. ${r}`).join('\n\n') +
        '\n\nExtract the exact styles from the source site so we match them precisely.\n' +
        'You MUST edit blocks/header/header.css and/or blocks/header/header.js to match the source site.\n' +
        'Compare each failing component against the source screenshot.\n' +
        'Fix CSS (colors, sizes, border-radius, padding, fonts, backgrounds) and JS (hover effects, click behavior, transitions, animations).\n' +
        'After each fix, re-run nav-component-critique (steps A–G) for that component.\n' +
        'Repeat the fix-critique cycle until every component reaches >= 95% similarity.\n' +
        'Do NOT mark anything validated without a real critique report. Do NOT self-assess.';
    } else {
      msg += '\n\nFix ALL issues. Do NOT skip. Do NOT self-assess similarity.';
    }
    logDecision('block', `${allErrors.length} issue(s)`);
    console.log(JSON.stringify({ decision: 'block', reason: blockReason(msg) }));
    return;
  }

  log('PASS', '=== ALL STOP CHECKS PASSED ===');
  logDecision('allow', 'All checks passed');
  console.log(JSON.stringify({ reason: 'Nav gate: all checks passed.' }));
}

// --- Main ---
async function main() {
  try {
    const hookInput = await readStdin();
    initSession(hookInput);
    const event = hookInput?.hook_event_name || hookInput?.hook_event || 'PostToolUse';
    const toolName = hookInput?.tool_name || 'N/A';
    const filePath = hookInput?.tool_input?.file_path || 'N/A';

    log('START', `========== NAV VALIDATION GATE HOOK ==========`);
    log('INFO', `Event: ${event} | Tool: ${toolName} | Session: ${sessionId}`);
    log('INFO', `File: ${filePath}`);
    log('INFO', `Tmp log: ${TMP_LOG}`);

    if (event === 'Stop') {
      handleStop(hookInput);
    } else {
      handlePostToolUse(hookInput);
    }
  } catch (error) {
    log('ERROR', `Hook crashed: ${error.message}`, { stack: error.stack });
    logDecision('allow', `Error fallback: ${error.message}`);
    console.log(JSON.stringify({ reason: `Nav gate error: ${error.message}` }));
    process.exit(0);
  }
}

main();
