/**
 * Check functions for nav-validation-gate.
 * Pure functions that return errors/blocks; no side effects.
 */

import fs from 'fs';
import path from 'path';
import {
  VALIDATION_DIR,
  ROW_DETECTION_MARKER,
  STYLE_REGISTER,
  SCHEMA_REGISTER,
  MEGAMENU_BEHAVIOR_REGISTER,
  ROW_ELEMENTS_BEHAVIOR_REGISTER,
  HEADER_APPEARANCE_REGISTER,
  HEADER_APPEARANCE_MAPPING,
  MOBILE_STYLE_REGISTER,
  MOBILE_SCHEMA_REGISTER,
  MOBILE_BEHAVIOR_REGISTER,
  MOBILE_HEADING_COVERAGE,
  MOBILE_DIMENSIONAL_GATE_REPORT,
  MOBILE_STRUCTURE_DETECTION_MARKER,
  MOBILE_DIR,
  AGGREGATE,
  MISSING_CONTENT_REGISTER,
  MOBILE_MISSING_CONTENT_REGISTER,
  IMAGE_AUDIT_MARKER,
  IMAGE_AUDIT_REPORT,
  SOURCE_IMAGE_MANIFEST,
  MIGRATED_IMAGE_MANIFEST,
  IMAGE_MANIFEST_COMPARE_MARKER,
  SIMILARITY_THRESHOLD,
  IMAGE_PATTERN,
  loadJson,
  hasRowElements,
  hasMegamenu,
  getNavFilePath,
} from './helpers.js';

/** Four mandatory critique components (Step 14). All 4 subagent workflows must complete; hooks block until each has status "validated" + critique proof (report + screenshots + ≥95%). Rest may be "skipped". */
const KEY_CRITIQUE_IDS_DESKTOP = ['key-critique-top-bar-desktop', 'key-critique-nav-links-row-desktop'];
const KEY_CRITIQUE_IDS_MOBILE = ['key-critique-mobile-header-bar', 'key-critique-mobile-menu-root-panel'];

/** Desktop validation complete (structural + behavior). Does NOT include style-register (critique). */
export function checkDesktopComplete(workspaceRoot) {
  const wr = workspaceRoot;
  if (hasMegamenu(wr)) {
    if (!fs.existsSync(path.join(wr, VALIDATION_DIR, 'migrated-megamenu-mapping.json'))) {
      return { pass: false, message: 'migrated-megamenu-mapping.json is MISSING. Complete desktop megamenu behavior validation first.' };
    }
    const behaviorReg = loadJson(path.join(wr, MEGAMENU_BEHAVIOR_REGISTER));
    if (!behaviorReg || !behaviorReg.allValidated) {
      const validated = behaviorReg ? (behaviorReg.items || []).filter(i => i.status === 'validated').length : 0;
      const total = behaviorReg ? (behaviorReg.items || []).length : 0;
      return { pass: false, message: `megamenu-behavior-register: ${validated}/${total} validated. Fix failed items, re-run compare-megamenu-behavior.js until allValidated: true.` };
    }
  }
  const schemaReg = loadJson(path.join(wr, SCHEMA_REGISTER));
  if (schemaReg && !schemaReg.allValidated) {
    const validated = (schemaReg.components || schemaReg.items || []).filter(c => c.status === 'validated').length;
    const total = (schemaReg.components || schemaReg.items || []).length;
    return { pass: false, message: `schema-register: ${validated}/${total} validated. Re-run compare-structural-schema.js until allValidated: true.` };
  }
  if (hasRowElements(wr)) {
    const rowBehaviorReg = loadJson(path.join(wr, ROW_ELEMENTS_BEHAVIOR_REGISTER));
    if (!rowBehaviorReg || !rowBehaviorReg.allValidated) {
      const validated = rowBehaviorReg ? (rowBehaviorReg.items || []).filter(i => i.status === 'validated').length : 0;
      const total = rowBehaviorReg ? (rowBehaviorReg.items || []).length : 0;
      return { pass: false, message: `row-elements-behavior-register: ${validated}/${total} validated. Fix failed items, re-run compare-row-elements-behavior.js until allValidated: true.` };
    }
  }
  const headerAppearanceSourceExists = fs.existsSync(path.join(wr, VALIDATION_DIR, 'header-appearance-mapping.json'));
  const migratedHeaderAppearanceExists = fs.existsSync(path.join(wr, VALIDATION_DIR, 'migrated-header-appearance-mapping.json'));
  const migratedRowElementsExists = fs.existsSync(path.join(wr, VALIDATION_DIR, 'migrated-row-elements-mapping.json'));
  const migratedMegamenuExists = fs.existsSync(path.join(wr, VALIDATION_DIR, 'migrated-megamenu-mapping.json'));
  const headerAppearancePostImpl = (hasRowElements(wr) && migratedRowElementsExists) || (hasMegamenu(wr) && migratedMegamenuExists);
  if (headerAppearanceSourceExists && headerAppearancePostImpl) {
    const headerAppReg = loadJson(path.join(wr, HEADER_APPEARANCE_REGISTER));
    if (!headerAppReg || !headerAppReg.allValidated) {
      return { pass: false, message: 'header-appearance-register is INCOMPLETE. Run compare-header-appearance.js until allValidated: true.' };
    }
  }
  return { pass: true };
}

/** Block header.css write until header-appearance-mapping.json (source) exists. Required for pre-implementation CSS template selection. */
export function checkHeaderAppearanceMappingBeforeImplementation(workspaceRoot) {
  const p2Exists = fs.existsSync(path.join(workspaceRoot, VALIDATION_DIR, 'phase-2-row-mapping.json'));
  const mappingExists = fs.existsSync(path.join(workspaceRoot, HEADER_APPEARANCE_MAPPING));
  if (p2Exists && !mappingExists) {
    return {
      pass: false,
      message: 'header-appearance-mapping.json (source) is REQUIRED before writing header.css.\n\nCreate it in Phase 2: observe the source header — default state (transparent/solid/gradient), interaction state (solid-white, blur, etc.), classToggle, requiresBodyPaddingTop, textColorInversion. Conform to references/header-appearance-mapping-schema.json. This ensures transparent vs solid behavior is documented and the correct CSS template is used.',
    };
  }
  return { pass: true };
}

/** When headerBackgroundBehavior.defaultState === "transparent", block header.css if it contains background-color on .nav-wrapper or .header (default state). */
export function checkHeaderBackgroundBehaviorTransparent(workspaceRoot) {
  const mappingPath = path.join(workspaceRoot, HEADER_APPEARANCE_MAPPING);
  if (!fs.existsSync(mappingPath)) return { pass: true };
  const mapping = loadJson(mappingPath);
  const hbb = mapping?.headerBackgroundBehavior;
  if (!hbb || hbb.defaultState !== 'transparent') return { pass: true };

  const cssPath = path.join(workspaceRoot, 'blocks', 'header', 'header.css');
  if (!fs.existsSync(cssPath)) return { pass: true };
  const css = fs.readFileSync(cssPath, 'utf-8');

  // Match CSS rule blocks: selector { declarations } — exclude interaction selectors.
  const interactionSelectors = [':hover', '.is-open', '.nav-hover', '.header-blur', '[data-open]', '.open'];
  const blockRegex = /([^{]+)\{([^}]*)\}/gs;
  let m;
  while ((m = blockRegex.exec(css)) !== null) {
    const selector = m[1];
    const declarations = m[2];
    if (!/\.nav-wrapper|\.header/.test(selector)) continue;
    if (interactionSelectors.some(s => selector.includes(s))) continue;
    const hasBg = /background(-color)?\s*:\s*[^;]+/i.test(declarations);
    if (!hasBg) continue;
    const bgValue = (declarations.match(/background(-color)?\s*:\s*([^;]+)/i) || [])[2] || '';
    if (/transparent|rgba\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|initial|inherit/.test(bgValue)) continue;
    return {
      pass: false,
      message: `headerBackgroundBehavior.defaultState is "transparent" but header.css sets background/background-color on .nav-wrapper or .header in default state.\n\nRemove solid background. Use transparent header template: no body padding, .is-open state toggle for interaction, text color inversion.`,
    };
  }
  return { pass: true };
}

// --- Missing content register ---
export function checkMissingContentRegister(workspaceRoot) {
  const errors = [];
  const regPath = path.join(workspaceRoot, MISSING_CONTENT_REGISTER);
  if (!fs.existsSync(regPath)) return { errors, remediation: [] };
  const reg = loadJson(regPath);
  if (!reg) return { errors, remediation: [] };
  const items = reg.items || reg.omissions || [];
  const unresolved = items.filter((i) => i.resolved !== true && i.status !== 'resolved');
  if (unresolved.length === 0) return { errors, remediation: [] };
  for (const item of unresolved) {
    const loc = item.location || item.panel || 'unknown';
    const desc = item.description || item.type || 'content';
    errors.push(`Missing content: "${desc}" at "${loc}" — add to nav file, extract the exact styles from the source site so we match them precisely, then set resolved: true in missing-content-register.json.`);
  }
  const remediation = [
    `Add the ${unresolved.length} missing item(s) to content/nav.plain.html. For each: location, description. Extract the exact styles from the source site so we match them precisely. Then update missing-content-register.json: set resolved: true for each added item. Re-run validate-nav-content.js.`,
  ];
  return { errors, remediation };
}

// --- Mobile missing content register ---
export function checkMobileMissingContentRegister(workspaceRoot) {
  const errors = [];
  const phase4Path = path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json');
  if (!fs.existsSync(phase4Path)) return { errors, remediation: [] };
  const regPath = path.join(workspaceRoot, MOBILE_MISSING_CONTENT_REGISTER);
  if (!fs.existsSync(regPath)) return { errors, remediation: [] };
  const reg = loadJson(regPath);
  if (!reg) return { errors, remediation: [] };
  const items = reg.items || reg.omissions || [];
  const unresolved = items.filter((i) => i.resolved !== true && i.status !== 'resolved');
  if (unresolved.length === 0) return { errors, remediation: [] };
  for (const item of unresolved) {
    const loc = item.location || item.panel || 'unknown';
    const desc = item.description || item.type || 'content';
    errors.push(`[MOBILE] Missing content: "${desc}" at "${loc}" — add to nav file (mobile-only section), extract the exact styles from the source site so we match them precisely, style with @media to show only at mobile breakpoint, then set resolved: true in mobile/missing-content-register.json.`);
  }
  const remediation = [
    `[MOBILE] Add the ${unresolved.length} missing item(s) to content/nav.plain.html. Use a mobile-only section (e.g. wrapped in a .mobile-only container). Extract the exact styles from the source site so we match them precisely. In header.css, ensure these items are hidden on desktop (display:none in default, display:block in @media for mobile). Set resolved: true in mobile/missing-content-register.json. Re-run validate-nav-content.js.`,
  ];
  return { errors, remediation };
}

// --- Nav location ---
export function checkNavLocation(filePath, workspaceRoot) {
  const base = path.basename(filePath);
  if (base === 'nav.md' || base === 'nav.html') {
    return `nav.md and nav.html are not supported. Use content/nav.plain.html. header.js fetches /nav.plain.html.`;
  }
  if (base !== 'nav.plain.html') return null;
  const rel = path.relative(workspaceRoot, filePath).split(path.sep).join('/');
  const parentDir = path.basename(path.dirname(filePath));
  if (parentDir !== 'content') {
    return `nav.plain.html written to "${rel}" — must be in content/. Rewrite to content/nav.plain.html.`;
  }
  return null;
}

// --- Nav images ---
function collectHasImagesElements(workspaceRoot) {
  const elements = [];
  const p2 = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-2-row-mapping.json'));
  const p3 = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-3-megamenu.json'));
  if (p2?.rows) {
    for (const row of p2.rows) {
      if (row.hasImages) elements.push(`Row ${row.index ?? '?'} (phase-2: hasImages=true)`);
    }
  }
  if (p3?.hasImages) elements.push('Megamenu overall (phase-3: hasImages=true)');
  if (p3?.columns) {
    for (const col of p3.columns) {
      if (col.hasImages) elements.push(`Megamenu column ${col.columnIndex ?? '?'} (phase-3: hasImages=true)`);
    }
  }
  return elements;
}

const IMG_TAG_PATTERN = /<img\s[^>]*src=["']([^"']+)["']/i;

export function checkNavContentForImages(filePath, workspaceRoot) {
  const base = path.basename(filePath);
  if (base !== 'nav.plain.html') return null;
  const hasImagesElements = collectHasImagesElements(workspaceRoot);
  if (hasImagesElements.length === 0) return null;
  let content = '';
  try { if (fs.existsSync(filePath)) content = fs.readFileSync(filePath, 'utf-8'); } catch (_) { return null; }
  if (!content) return null;
  if (IMAGE_PATTERN.test(content)) return null;
  if (IMG_TAG_PATTERN.test(content)) return null;
  return `nav content has NO image references, but phases require images for ${hasImagesElements.length} element(s):\n` +
    hasImagesElements.map((e, i) => `  ${i + 1}. ${e}`).join('\n') +
    '\n\nDownload images to content/images/, reference in nav file (markdown ![alt](path) or HTML <img src="path">).';
}

/** Gate ROW_LANDMARK_PARITY: phase-2 must have at least as many rows as phase-1.rowCount. */
export function checkRowLandmarkParity(workspaceRoot) {
  const p1 = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-1-row-detection.json'));
  const p2 = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-2-row-mapping.json'));
  if (!p1 || !p2) return null;
  const requiredRows = p1.rowCount != null ? p1.rowCount : 0;
  const actualRows = (p2.rows || []).length;
  if (actualRows < requiredRows) {
    return `phase-2-row-mapping.json has ${actualRows} row(s) but phase-1 requires ${requiredRows}. Implement ALL header rows (e.g. utility bar, main nav). Run detect-header-rows.js to confirm row count; do not omit rows.`;
  }
  return null;
}

/** Gate IMAGE_PARITY: when both manifests exist, compare must have run and passed. */
export function checkImageManifestParity(workspaceRoot) {
  const srcPath = path.join(workspaceRoot, SOURCE_IMAGE_MANIFEST);
  const migPath = path.join(workspaceRoot, MIGRATED_IMAGE_MANIFEST);
  const markerPath = path.join(workspaceRoot, IMAGE_MANIFEST_COMPARE_MARKER);
  if (!fs.existsSync(srcPath) || !fs.existsSync(migPath)) return null;
  if (!fs.existsSync(markerPath)) {
    return `source-image-manifest.json and migrated-image-manifest.json exist but audit-header-images.js --compare has NOT been run or did not pass. Run: node scripts/audit-header-images.js --compare=blocks/header/navigation-validation/source-image-manifest.json --against=blocks/header/navigation-validation/migrated-image-manifest.json --validation-dir=blocks/header/navigation-validation`;
  }
  return null;
}

/** Gate FEATURE_CARD_COMPLETENESS: if source has bgImages in header and megamenu has triggers, mapping must document featureCards. */
export function checkFeatureCardCompleteness(workspaceRoot) {
  const mmPath = path.join(workspaceRoot, VALIDATION_DIR, 'megamenu-mapping.json');
  const srcManifestPath = path.join(workspaceRoot, SOURCE_IMAGE_MANIFEST);
  if (!fs.existsSync(mmPath) || !fs.existsSync(srcManifestPath)) return null;
  const mm = loadJson(mmPath);
  const srcManifest = loadJson(srcManifestPath);
  const triggers = mm?.navTriggers || [];
  if (triggers.length === 0) return null;
  const bgCount = srcManifest?.summary?.bgImages ?? 0;
  if (bgCount === 0) return null;
  const hasFeatureCard = triggers.some(t => t.featureCard?.exists || (t.featureCard && Object.keys(t.featureCard).length > 0));
  if (!hasFeatureCard) {
    return `Source has ${bgCount} background-image(s) in header (source-image-manifest.json) but megamenu-mapping.json has no featureCard documented for any trigger. Map each megamenu feature/promotional card (title, imageUrl, imageType, size) per trigger.`;
  }
  return null;
}

/** Gate HEADER_HEIGHT_SANITY: if phase-1 reports heightMismatch, block and warn. */
export function checkHeaderHeightSanity(workspaceRoot) {
  const p1Path = path.join(workspaceRoot, VALIDATION_DIR, 'phase-1-row-detection.json');
  if (!fs.existsSync(p1Path)) return null;
  const p1 = loadJson(p1Path);
  if (p1?.heightMismatch === true) {
    return `phase-1-row-detection.json reports heightMismatch: header total height (${p1.headerTotalHeight ?? '?'}px) is >1.3× sum of detected rows (${p1.detectedRowsHeight ?? '?'}px). Likely a missed row. Re-run detect-header-rows.js and implement ALL rows before proceeding.`;
  }
  return null;
}

/**
 * Image audit: expected vs actual header images. After nav.plain.html exists and images are downloaded,
 * audit-header-images.js must run and pass (expected count satisfied, all refs on disk with size > 0).
 * Returns error string or null.
 */
export function checkImageAudit(workspaceRoot) {
  const navFilePath = getNavFilePath(workspaceRoot);
  if (!navFilePath) return null;
  const markerPath = path.join(workspaceRoot, IMAGE_AUDIT_MARKER);
  const reportPath = path.join(workspaceRoot, IMAGE_AUDIT_REPORT);
  if (!fs.existsSync(markerPath)) {
    return `content/nav.plain.html exists but audit-header-images.js has NOT been run. Run: node scripts/audit-header-images.js content/nav.plain.html blocks/header/navigation-validation — compares expected image count (from phase-2/3 and megamenu-mapping) to actual images in nav and on disk; blocks until no gap.`;
  }
  if (fs.existsSync(reportPath)) {
    const report = loadJson(reportPath);
    if (report && report.passed === false) {
      const missing = (report.missingByLocation || []).length;
      const broken = (report.missingOrEmpty || []).length;
      return `image-audit-report.json shows FAILED: expected ${report.expectedCount} image(s), actual ${report.actualCount}. Missing by location: ${missing}. Missing or 0-byte files: ${broken}. Download missing images to content/images/, add refs to nav.plain.html, re-run validate-nav-content.js then audit-header-images.js.`;
    }
  }
  return null;
}

// --- Critique proof ---
export function checkCritiqueProof(workspaceRoot) {
  const errors = [];
  const reg = loadJson(path.join(workspaceRoot, STYLE_REGISTER));
  if (!reg) return errors;
  const components = reg.components || [];
  for (const c of components) {
    if (c.status !== 'validated') continue;
    if (!c.critiqueReportPath || c.critiqueReportPath === '') {
      errors.push(`Style register: "${c.id}" marked validated but critiqueReportPath is EMPTY. Run nav-component-critique (steps A-G) to produce a report.`);
    } else {
      const reportPath = path.isAbsolute(c.critiqueReportPath) ? c.critiqueReportPath : path.join(workspaceRoot, c.critiqueReportPath);
      if (!fs.existsSync(reportPath)) {
        errors.push(`Style register: "${c.id}" critiqueReportPath="${c.critiqueReportPath}" does NOT exist on disk. Critique did not run. Execute nav-component-critique steps C-E for this component.`);
      }
    }
    if (!c.screenshotSourcePath || c.screenshotSourcePath === '') {
      errors.push(`Style register: "${c.id}" marked validated but screenshotSourcePath is EMPTY. Capture source component screenshot (critique Step C).`);
    } else {
      const srcPath = path.isAbsolute(c.screenshotSourcePath) ? c.screenshotSourcePath : path.join(workspaceRoot, c.screenshotSourcePath);
      if (!fs.existsSync(srcPath)) {
        errors.push(`Style register: "${c.id}" screenshotSourcePath="${c.screenshotSourcePath}" does NOT exist on disk. Capture source screenshot (critique Step C).`);
      }
    }
    if (!c.screenshotMigratedPath || c.screenshotMigratedPath === '') {
      errors.push(`Style register: "${c.id}" marked validated but screenshotMigratedPath is EMPTY. Capture migrated component screenshot (critique Step D).`);
    } else {
      const migPath = path.isAbsolute(c.screenshotMigratedPath) ? c.screenshotMigratedPath : path.join(workspaceRoot, c.screenshotMigratedPath);
      if (!fs.existsSync(migPath)) {
        errors.push(`Style register: "${c.id}" screenshotMigratedPath="${c.screenshotMigratedPath}" does NOT exist on disk. Capture migrated screenshot (critique Step D).`);
      }
    }
    if (!c.critiqueIterations || c.critiqueIterations < 1) {
      errors.push(`Style register: "${c.id}" critiqueIterations=${c.critiqueIterations ?? 0}. Must be >= 1 proving inline critique ran at least once.`);
    }
  }
  return errors;
}

// --- Mobile critique proof ---
export function checkMobileCritiqueProof(workspaceRoot) {
  const errors = [];
  const reg = loadJson(path.join(workspaceRoot, MOBILE_STYLE_REGISTER));
  if (!reg) return errors;
  const components = reg.components || [];
  for (const c of components) {
    if (c.status !== 'validated') continue;
    if (!c.critiqueReportPath || c.critiqueReportPath === '') {
      errors.push(`[MOBILE] "${c.id}" marked validated but critiqueReportPath is EMPTY.`);
    } else {
      const reportPath = path.isAbsolute(c.critiqueReportPath) ? c.critiqueReportPath : path.join(workspaceRoot, c.critiqueReportPath);
      if (!fs.existsSync(reportPath)) errors.push(`[MOBILE] "${c.id}" critiqueReportPath="${c.critiqueReportPath}" does NOT exist on disk.`);
    }
    if (!c.screenshotSourcePath || !fs.existsSync(path.isAbsolute(c.screenshotSourcePath) ? c.screenshotSourcePath : path.join(workspaceRoot, c.screenshotSourcePath || ''))) {
      errors.push(`[MOBILE] "${c.id}" screenshotSourcePath missing or not on disk.`);
    }
    if (!c.screenshotMigratedPath || !fs.existsSync(path.isAbsolute(c.screenshotMigratedPath) ? c.screenshotMigratedPath : path.join(workspaceRoot, c.screenshotMigratedPath || ''))) {
      errors.push(`[MOBILE] "${c.id}" screenshotMigratedPath missing or not on disk.`);
    }
    if (!c.critiqueIterations || c.critiqueIterations < 1) {
      errors.push(`[MOBILE] "${c.id}" critiqueIterations=${c.critiqueIterations ?? 0}. Must be >= 1.`);
    }
  }
  return errors;
}

// --- Style register ---
export function checkStyleRegister(workspaceRoot) {
  const errors = [];
  const remediation = [];
  const reg = loadJson(path.join(workspaceRoot, STYLE_REGISTER));
  if (!reg) {
    errors.push('style-register.json does not exist. Build from phase-1/2/3.');
    return { errors, remediation };
  }
  if (!reg.allValidated) errors.push('style-register.json allValidated=false. The 4 key critique components must be validated; rest may be skipped.');
  const components = reg.components || [];
  const byId = new Map((components || []).map(c => [c.id, c]));
  for (const c of components) {
    if (c.status === 'pending') errors.push(`Style: "${c.id}" status="pending" — must be "validated" (for key components) or "skipped".`);
    if (c.status === 'validated') {
      if (typeof c.lastSimilarity === 'number' && c.lastSimilarity < SIMILARITY_THRESHOLD) {
        errors.push(`Style: "${c.id}" lastSimilarity=${c.lastSimilarity}% — must be >= ${SIMILARITY_THRESHOLD}%.`);
        remediation.push(`[${c.id}] at ${c.lastSimilarity}%: Extract the exact styles from the source site so we match them precisely. Open blocks/header/header.css and blocks/header/header.js. Compare "${c.id}" visually against the source site screenshot. Fix CSS properties and JS behavior to match the source. Then re-run nav-component-critique (steps A–G) for "${c.id}". Repeat until >= 95%.`);
      }
    }
  }
  for (const keyId of KEY_CRITIQUE_IDS_DESKTOP) {
    const c = byId.get(keyId);
    if (!c) errors.push(`Style register missing key component "${keyId}". Add it and run critique (Step 14).`);
    else if (c.status !== 'validated') errors.push(`Style: key component "${keyId}" must have status "validated" with critique proof.`);
  }
  if (components.length === 0) errors.push('style-register.json has 0 components.');
  errors.push(...checkCritiqueProof(workspaceRoot));
  return { errors, remediation };
}

// --- Schema register ---
export function checkSchemaRegister(workspaceRoot) {
  const errors = [];
  const remediation = [];
  const reg = loadJson(path.join(workspaceRoot, SCHEMA_REGISTER));
  if (!reg) {
    errors.push('schema-register.json does not exist.');
    return { errors, remediation };
  }
  if (!reg.allValidated) errors.push('schema-register.json allValidated=false.');
  const items = reg.items || [];
  for (const it of items) {
    if (it.status !== 'validated') errors.push(`Schema: "${it.id}" status="${it.status}".`);
    if (it.sourceMatch === false) {
      errors.push(`Schema: "${it.id}" sourceMatch=false.`);
      remediation.push(`[${it.id}] structural mismatch: Fix implementation. Re-extract migrated-structural-summary.json and re-run compare-structural-schema.js --output-register.`);
    }
  }
  if (items.length === 0) errors.push('schema-register.json has 0 items.');
  return { errors, remediation };
}

/** Heuristic: a note that describes source vs migrated differences suggests LLM shortcut (marked validated but documented mismatch instead of fixing). */
function isShortcutNote(note) {
  if (!note || typeof note !== 'string') return false;
  const n = note.toLowerCase();
  return /not included|not in (eds|migrated)|migrated (does not|uses|has) |source has .+ (but|;) migrated|different (structure|layout|grid)|flat grid|instead of|rather than/i.test(n);
}

/** Check megamenu-behavior-register for shortcut notes (validated + note describing mismatch). Returns { pass, shortcutItems } for gate use. */
export function checkMegamenuBehaviorRegisterShortcutNotes(workspaceRoot) {
  const shortcutItems = [];
  if (!hasMegamenu(workspaceRoot)) return { pass: true, shortcutItems: [] };
  const reg = loadJson(path.join(workspaceRoot, MEGAMENU_BEHAVIOR_REGISTER));
  if (!reg) return { pass: true, shortcutItems: [] };
  for (const item of reg.items || []) {
    if (item.status === 'validated') {
      const note = item.contentMatch?.note || item.stylingMatch?.note || item.note;
      if (isShortcutNote(note)) shortcutItems.push({ id: item.id, label: item.label, note });
    }
  }
  return { pass: shortcutItems.length === 0, shortcutItems };
}

/** Check row-elements-behavior-register for shortcut notes (validated + note describing mismatch). Returns { pass, shortcutItems } for gate use. */
export function checkRowElementsBehaviorRegisterShortcutNotes(workspaceRoot) {
  const shortcutItems = [];
  if (!hasRowElements(workspaceRoot)) return { pass: true, shortcutItems: [] };
  const reg = loadJson(path.join(workspaceRoot, ROW_ELEMENTS_BEHAVIOR_REGISTER));
  if (!reg) return { pass: true, shortcutItems: [] };
  for (const item of reg.items || []) {
    if (item.status === 'validated') {
      const note = item.hoverMatch?.note || item.clickMatch?.note || item.note;
      if (isShortcutNote(note)) shortcutItems.push({ id: item.id, label: item.label, note });
    }
  }
  return { pass: shortcutItems.length === 0, shortcutItems };
}

/** Check mobile-behavior-register for shortcut notes (validated + note describing mismatch). Returns { pass, shortcutItems } for gate use. */
export function checkMobileBehaviorRegisterShortcutNotes(workspaceRoot) {
  const shortcutItems = [];
  const phase4Path = path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json');
  if (!fs.existsSync(phase4Path)) return { pass: true, shortcutItems: [] };
  const reg = loadJson(path.join(workspaceRoot, MOBILE_BEHAVIOR_REGISTER));
  if (!reg) return { pass: true, shortcutItems: [] };
  for (const item of reg.items || []) {
    if (item.status === 'validated') {
      const note = item.tapMatch?.note || item.behaviorMatch?.note || item.animationMatch?.note || item.note;
      if (isShortcutNote(note)) shortcutItems.push({ id: item.id, label: item.label || '', note });
    }
  }
  return { pass: shortcutItems.length === 0, shortcutItems };
}

// --- Megamenu behavior register ---
export function checkMegamenuBehaviorRegister(workspaceRoot) {
  const errors = [];
  const remediation = [];
  if (!hasMegamenu(workspaceRoot)) return { errors, remediation };
  const reg = loadJson(path.join(workspaceRoot, MEGAMENU_BEHAVIOR_REGISTER));
  if (!reg) {
    errors.push('megamenu-behavior-register.json does not exist. Run compare-megamenu-behavior.js after creating migrated-megamenu-mapping.json.');
    return { errors, remediation };
  }
  if (!reg.allValidated) errors.push('megamenu-behavior-register.json allValidated=false. Megamenu sub-items have hover/click/styling mismatches.');
  const items = reg.items || [];
  for (const item of items) {
    // Hook: validated + note describing mismatch = shortcut path (block)
    if (item.status === 'validated') {
      const note = item.contentMatch?.note || item.stylingMatch?.note || item.note;
      if (isShortcutNote(note)) {
        errors.push(`Megamenu behavior: "${item.id}" (${item.label}) marked validated but has note describing mismatch — do not shortcut. Fix the implementation to match source; remove the note.`);
        remediation.push(`[${item.id}] ${item.label}: The note indicates source differs from migrated. Add missing content/structure to nav file and header.js — do not mark validated with a note documenting the difference.`);
      }
    }
    if (item.status === 'failed') {
      const issues = [];
      if (!item.hoverMatch?.matches) issues.push('hover');
      if (!item.clickMatch?.matches) issues.push('click');
      if (!item.stylingMatch?.matches) issues.push('styling');
      errors.push(`Megamenu behavior: "${item.id}" (${item.label}) failed: ${issues.join(', ')}.`);
      if (item.remediation) remediation.push(`[${item.id}] ${item.label}: ${item.remediation}`);
      else {
        const fixes = [];
        if (!item.hoverMatch?.matches) fixes.push(`hover: ${item.hoverMatch?.delta || 'match source hover'}`);
        if (!item.clickMatch?.matches) fixes.push(`click: ${item.clickMatch?.delta || 'match source click'}`);
        if (!item.stylingMatch?.matches) fixes.push(`styling: ${item.stylingMatch?.delta || 'match source appearance'}`);
        remediation.push(`[${item.id}] ${item.label}: Extract the exact styles from the source site so we match them precisely. Fix in header.js/header.css — ${fixes.join('; ')}`);
      }
    }
  }
  if (items.length === 0) errors.push('megamenu-behavior-register.json has 0 items.');
  return { errors, remediation };
}

// --- Panel layout measured values (viewport containment — no self-assessment) ---
const PANEL_TYPES = ['megamenu', 'dropdown', 'flyout'];

function hasMeasuredValues(details) {
  if (!details) return false;
  const hasDirect = typeof details.measuredLeft === 'number' &&
    typeof details.measuredRight === 'number' &&
    typeof details.viewportWidth === 'number';
  const hasViewports = Array.isArray(details.viewportsTested) && details.viewportsTested.length > 0;
  return hasDirect || hasViewports;
}

function checkMappingMeasuredValues(mapping, label) {
  const errors = [];
  const triggers = mapping?.navTriggers || [];
  for (const t of triggers) {
    if (!PANEL_TYPES.includes(t.panelType)) continue;
    const d = t.panelLayoutDetails;
    if (!d) {
      errors.push(`${label}: "${t.label || t.index}" has panelType=${t.panelType} but panelLayoutDetails is MISSING.`);
      continue;
    }
    if (!hasMeasuredValues(d)) {
      errors.push(`${label}: "${t.label || t.index}" panelLayoutDetails missing measured values. Use getBoundingClientRect() and add measuredLeft, measuredRight, viewportWidth — or viewportsTested (1440, 1920, 1366, 1280, 1024px).`);
    }
    const vts = d.viewportsTested || [];
    for (const v of vts) {
      if (v.contained === false) {
        errors.push(`${label}: "${t.label || t.index}" viewport ${v.viewportWidth}x${v.viewportHeight} overflow: measuredLeft=${v.measuredLeft}, measuredRight=${v.measuredRight}.`);
      }
    }
    if (typeof d.measuredLeft === 'number' && d.measuredLeft < 0) {
      errors.push(`${label}: "${t.label || t.index}" panel overflow: measuredLeft=${d.measuredLeft} < 0.`);
    }
    if (typeof d.measuredRight === 'number' && typeof d.viewportWidth === 'number' && d.measuredRight > d.viewportWidth) {
      errors.push(`${label}: "${t.label || t.index}" panel overflow: measuredRight=${d.measuredRight} > viewportWidth=${d.viewportWidth}.`);
    }
  }
  return errors;
}

export function checkPanelLayoutMeasuredValues(workspaceRoot) {
  const errors = [];
  const remediation = [
    'For each megamenu/dropdown/flyout trigger: open panel, run getBoundingClientRect() on panel element, add measuredLeft, measuredRight, viewportWidth to panelLayoutDetails. Test at 1440, 1920, 1366, 1280, 1024px. Extract cssPosition, cssLeft, cssWidth from getComputedStyle. Re-run compare-megamenu-behavior.js.',
  ];
  const mmPath = path.join(workspaceRoot, VALIDATION_DIR, 'megamenu-mapping.json');
  const migPath = path.join(workspaceRoot, VALIDATION_DIR, 'migrated-megamenu-mapping.json');
  if (!fs.existsSync(mmPath) && !fs.existsSync(migPath)) return { errors, remediation };
  const source = loadJson(mmPath);
  const migrated = loadJson(migPath);
  if (source) errors.push(...checkMappingMeasuredValues(source, 'megamenu-mapping'));
  if (migrated) errors.push(...checkMappingMeasuredValues(migrated, 'migrated-megamenu-mapping'));
  return { errors, remediation };
}

// --- Mobile registers ---
export function checkMobileRegisters(workspaceRoot) {
  const errors = [];
  const remediation = [];
  const phase4Path = path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json');
  if (!fs.existsSync(phase4Path)) return { errors, remediation };

  const mobileStructureMarker = path.join(workspaceRoot, MOBILE_STRUCTURE_DETECTION_MARKER);
  if (!fs.existsSync(mobileStructureMarker)) {
    errors.push('[MOBILE] detect-mobile-structure.js has NOT been run. Run: node scripts/detect-mobile-structure.js --url=<source-url> [--validation-dir=blocks/header/navigation-validation] (viewport 375×812). Same as desktop: programmatic row and item count before mobile structural validation. When mobile has extra images/text, add to nav.plain.html mobile-only section and mobile missing-content-register.');
  }

  const phase4 = loadJson(phase4Path);
  if (phase4 && !phase4.hamburgerAnimation) errors.push('phase-4-mobile.json missing hamburgerAnimation — re-analyze mobile header with hamburger icon click test.');
  if (phase4 && !phase4.accordionBehavior) errors.push('phase-4-mobile.json missing accordionBehavior — re-analyze mobile menu accordion/drawer behavior.');
  if (phase4 && !phase4.overlayBehavior) errors.push('phase-4-mobile.json missing overlayBehavior — check if source mobile menu has backdrop overlay.');
  const mobileSchemaReg = loadJson(path.join(workspaceRoot, MOBILE_SCHEMA_REGISTER));
  if (!fs.existsSync(path.join(workspaceRoot, MOBILE_SCHEMA_REGISTER))) {
    errors.push('mobile-schema-register.json does NOT exist. Run detect-mobile-structure.js first, then extract migrated-mobile-structural-summary.json (same shape as mobile-structure-detection.json), then: node scripts/compare-mobile-structural-schema.js .../mobile/mobile-structure-detection.json .../mobile/migrated-mobile-structural-summary.json --output-register=.../mobile/mobile-schema-register.json');
  } else if (mobileSchemaReg) {
    if (!mobileSchemaReg.allValidated) errors.push('mobile-schema-register.json allValidated=false. Fix mobile structural mismatches.');
    for (const it of (mobileSchemaReg.items || [])) {
      if (it.status !== 'validated') errors.push(`Mobile schema: "${it.id}" status="${it.status}".`);
    }
  }
  const mobileStyleReg = loadJson(path.join(workspaceRoot, MOBILE_STYLE_REGISTER));
  if (!fs.existsSync(path.join(workspaceRoot, MOBILE_STYLE_REGISTER))) {
    errors.push('mobile-style-register.json does NOT exist. Run nav-component-critique for the 2 key mobile components at 375×812 viewport.');
  } else if (mobileStyleReg) {
    if (!mobileStyleReg.allValidated) errors.push('mobile-style-register.json allValidated=false. The 2 key mobile critique components must be validated; rest may be skipped.');
    const mobileComps = mobileStyleReg.components || [];
    const mobileById = new Map(mobileComps.map(c => [c.id, c]));
    for (const c of mobileComps) {
      if (c.status === 'pending') errors.push(`Mobile style: "${c.id}" status="pending" — must be "validated" (for key components) or "skipped".`);
      if (c.status === 'validated' && typeof c.lastSimilarity === 'number' && c.lastSimilarity < SIMILARITY_THRESHOLD) {
        errors.push(`Mobile style: "${c.id}" lastSimilarity=${c.lastSimilarity}% — must be >= ${SIMILARITY_THRESHOLD}%.`);
        remediation.push(`[MOBILE ${c.id}] at ${c.lastSimilarity}%: Extract the exact styles from the source site so we match them precisely. Fix mobile CSS in header.css (within @media query). Run nav-component-critique for this mobile component at 375x812. Repeat until >= 95%.`);
      }
    }
    for (const keyId of KEY_CRITIQUE_IDS_MOBILE) {
      const c = mobileById.get(keyId);
      if (!c) errors.push(`Mobile style register missing key component "${keyId}". Add it and run critique (Step 14).`);
      else if (c.status !== 'validated') errors.push(`Mobile style: key component "${keyId}" must have status "validated" with critique proof.`);
    }
  }
  return { errors, remediation };
}

// --- Mobile behavior register ---
export function checkMobileBehaviorRegister(workspaceRoot) {
  const errors = [];
  const remediation = [];
  if (!fs.existsSync(path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json'))) return { errors, remediation };
  const reg = loadJson(path.join(workspaceRoot, MOBILE_BEHAVIOR_REGISTER));
  if (!reg) {
    errors.push('[MOBILE] mobile-behavior-register.json does not exist. After mobile implementation, tap/click every mobile nav item and record behavior, then run compare-mobile-behavior.js.');
    return { errors, remediation };
  }
  if (!reg.allValidated) errors.push('[MOBILE] mobile-behavior-register.json allValidated=false. Mobile nav items have tap/click/behavior mismatches.');
  const items = reg.items || [];
  for (const item of items) {
    // Hook: validated + note describing mismatch = shortcut path (block)
    if (item.status === 'validated') {
      const note = item.tapMatch?.note || item.behaviorMatch?.note || item.animationMatch?.note || item.note;
      if (isShortcutNote(note)) {
        errors.push(`[MOBILE] Behavior: "${item.id}" (${item.label || ''}) marked validated but has note describing mismatch — do not shortcut. Fix the implementation to match source; remove the note.`);
        remediation.push(`[MOBILE ${item.id}] ${item.label || ''}: The note indicates source differs from migrated. Fix mobile implementation — do not mark validated with a note documenting the difference.`);
      }
    }
    if (item.status === 'failed') {
      const issues = [];
      if (!item.tapMatch?.matches) issues.push('tap/click');
      if (!item.behaviorMatch?.matches) issues.push('behavior (accordion/slide-in)');
      if (!item.animationMatch?.matches) issues.push('animation speed/timing');
      errors.push(`[MOBILE] Behavior: "${item.id}" (${item.label || ''}) failed: ${issues.join(', ')}.`);
      if (item.remediation) remediation.push(`[MOBILE ${item.id}] ${item.label || ''}: ${item.remediation}`);
      else {
        const fixes = [];
        if (!item.tapMatch?.matches) fixes.push(`tap: ${item.tapMatch?.delta || 'match source tap behavior'}`);
        if (!item.behaviorMatch?.matches) fixes.push(`behavior: ${item.behaviorMatch?.delta || 'match source open/expand behavior'}`);
        if (!item.animationMatch?.matches) fixes.push(`animation: ${item.animationMatch?.delta || 'match source transition speed/easing'}`);
        remediation.push(`[MOBILE ${item.id}] ${item.label || ''}: Extract the exact styles from the source site so we match them precisely. Fix in header.js/header.css @media — ${fixes.join('; ')}`);
      }
    }
  }
  if (items.length === 0) errors.push('[MOBILE] mobile-behavior-register.json has 0 items.');
  return { errors, remediation };
}

/** When phase-4 exists, mobile-dimensional-gate.js MUST have been run and report must show passed: true. */
export function checkMobileDimensionalGate(workspaceRoot) {
  const errors = [];
  const remediation = [];
  const phase4Path = path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json');
  if (!fs.existsSync(phase4Path)) return { errors, remediation };

  const reportPath = path.join(workspaceRoot, MOBILE_DIMENSIONAL_GATE_REPORT);
  if (!fs.existsSync(reportPath)) {
    errors.push(
      '[MOBILE] mobile-dimensional-gate has NOT been run. Run: node scripts/mobile-dimensional-gate.js --url=<migrated-url> --validation-dir=blocks/header/navigation-validation (viewport 375×812). Open hamburger, then fix any failed checks (e.g. .nav-list width: 100%) until the script exits 0. Do not build mobile-style-register or announce completion until the gate passes.',
    );
    remediation.push(
      '[MOBILE-DIMENSIONAL-GATE] Run mobile-dimensional-gate.js against the migrated site at 375×812. Fix CSS so menu list and nav items span full viewport width; re-run until exit 0.',
    );
    return { errors, remediation };
  }

  const report = loadJson(reportPath);
  if (!report || report.passed !== true) {
    const summary = report?.summary || 'report missing or invalid';
    errors.push(
      `[MOBILE] mobile-dimensional-gate report exists but passed is not true: ${summary}. Fix CSS (e.g. .nav-list and .nav-item width: 100%) and re-run: node scripts/mobile-dimensional-gate.js --url=<migrated-url> --validation-dir=blocks/header/navigation-validation. Do not proceed until the gate passes.`,
    );
    remediation.push(
      '[MOBILE-DIMENSIONAL-GATE] Re-run mobile-dimensional-gate.js. Apply fixes from failed checks (menu list width, nav-item width, edge-to-edge alignment). Repeat until report shows passed: true.',
    );
  }
  return { errors, remediation };
}

// --- Mobile animation speed ---
export function checkMobileAnimationSpeed(workspaceRoot) {
  const errors = [];
  const p4 = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json'));
  if (!p4) return errors;
  const cssPath = path.join(workspaceRoot, 'blocks', 'header', 'header.css');
  if (!fs.existsSync(cssPath)) return errors;
  let css;
  try { css = fs.readFileSync(cssPath, 'utf8'); } catch (_) { return errors; }
  const hamburgerAnim = p4.hamburgerAnimation;
  if (hamburgerAnim?.transition) {
    const m = hamburgerAnim.transition.match(/([\d.]+)s/);
    if (m && !css.includes(m[1] + 's') && !css.includes((parseFloat(m[1]) * 1000) + 'ms')) {
      errors.push(`[MOBILE] Hamburger animation: source transition is "${hamburgerAnim.transition}" but header.css does not contain "${m[1]}s" or "${parseFloat(m[1]) * 1000}ms".`);
    }
  }
  const slideIn = p4.slideInPanelBehavior;
  if (slideIn?.transitionDuration) {
    const m = slideIn.transitionDuration.match(/([\d.]+)s/);
    if (m && !css.includes(m[1] + 's') && !css.includes((parseFloat(m[1]) * 1000) + 'ms')) {
      errors.push(`[MOBILE] Slide-in panel: source transitionDuration is "${slideIn.transitionDuration}" but header.css does not contain "${m[1]}s".`);
    }
  }
  const accordion = p4.accordionBehavior;
  if (accordion?.animationDuration) {
    const m = accordion.animationDuration.match(/([\d.]+)s/);
    if (m && !css.includes(m[1] + 's') && !css.includes((parseFloat(m[1]) * 1000) + 'ms')) {
      errors.push(`[MOBILE] Accordion: source animationDuration is "${accordion.animationDuration}" but header.css does not contain "${m[1]}s".`);
    }
  }
  return errors;
}

// --- Hamburger animation ---
export function checkHamburgerAnimation(workspaceRoot) {
  const errors = [];
  const phase4 = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json'));
  if (!phase4) return errors;
  const anim = phase4.hamburgerAnimation;
  if (!anim) {
    errors.push('phase-4-mobile.json: hamburgerAnimation field MISSING. Click the hamburger icon and document the animation.');
    return errors;
  }
  if (!anim.type || anim.type === 'none') return errors;
  if (!anim.method) errors.push('hamburgerAnimation.method missing — record the CSS/JS implementation method.');
  const headerCss = path.join(workspaceRoot, 'blocks', 'header', 'header.css');
  if (anim.type === 'morph-to-cross' && anim.method === 'css-transform' && fs.existsSync(headerCss)) {
    try {
      const css = fs.readFileSync(headerCss, 'utf-8');
      if (!css.includes('rotate') && !css.includes('transform')) {
        errors.push('hamburgerAnimation is css-transform morph-to-cross but header.css has NO rotate/transform rules.');
      }
    } catch (_) { /* ignore */ }
  }
  return errors;
}

/** Prerequisites for building style-register.json and mobile-style-register.json (Step 13).
 * Blocks until BOTH desktop AND mobile validation are complete (all JSON files ready and validated). */
export function checkStyleRegistersPrerequisites(workspaceRoot) {
  const missing = [];
  const wr = workspaceRoot;

  // Desktop: structural + behavior complete (no style-register)
  const desktopResult = checkDesktopComplete(wr);
  if (!desktopResult.pass) {
    missing.push(`[DESKTOP] ${desktopResult.message}`);
  }

  // Mobile: phase-4 must exist and all mobile validation complete
  const phase4Path = path.join(wr, VALIDATION_DIR, 'phase-4-mobile.json');
  if (!fs.existsSync(phase4Path)) {
    missing.push('phase-4-mobile.json — complete desktop, get customer confirmation, then create phase-4-mobile.json');
    return { allPassed: false, missing };
  }

  if (!fs.existsSync(path.join(wr, MOBILE_DIR, 'migrated-mobile-structural-summary.json'))) {
    missing.push('mobile/migrated-mobile-structural-summary.json');
  }
  if (!fs.existsSync(path.join(wr, MOBILE_SCHEMA_REGISTER))) {
    missing.push('mobile/mobile-schema-register.json');
  } else {
    const mobileSchemaReg = loadJson(path.join(wr, MOBILE_SCHEMA_REGISTER));
    if (!mobileSchemaReg || !mobileSchemaReg.allValidated) {
      missing.push('mobile/mobile-schema-register.json allValidated=true');
    }
  }
  if (!fs.existsSync(path.join(wr, MOBILE_HEADING_COVERAGE))) {
    missing.push('mobile/mobile-heading-coverage.json');
  } else {
    const headingCov = loadJson(path.join(wr, MOBILE_HEADING_COVERAGE));
    if (headingCov && !headingCov.allCovered) {
      missing.push('mobile/mobile-heading-coverage.json allCovered=true');
    }
  }
  if (!fs.existsSync(path.join(wr, MOBILE_BEHAVIOR_REGISTER))) {
    missing.push('mobile/mobile-behavior-register.json');
  } else {
    const mobileBehaviorReg = loadJson(path.join(wr, MOBILE_BEHAVIOR_REGISTER));
    if (!mobileBehaviorReg || !mobileBehaviorReg.allValidated) {
      missing.push('mobile/mobile-behavior-register.json allValidated=true');
    }
  }

  const mobileMissingResult = checkMobileMissingContentRegister(wr);
  if (mobileMissingResult.errors.length > 0) {
    missing.push(`[MOBILE] missing-content-register: ${mobileMissingResult.errors.length} unresolved — set resolved: true for all`);
  }

  return { allPassed: missing.length === 0, missing };
}

// --- Critique prerequisites ---
export function checkCritiquePrerequisites(workspaceRoot) {
  const missing = [];
  const check = (rel, label) => {
    const full = path.isAbsolute(rel) ? rel : path.join(workspaceRoot, rel);
    const ok = fs.existsSync(full);
    if (!ok) missing.push(label || rel);
    return ok;
  };
  if (!check(path.join(VALIDATION_DIR, 'session.json'), 'session.json')) { /* captured */ }
  if (!check(path.join(VALIDATION_DIR, 'phase-1-row-detection.json'), 'phase-1-row-detection.json')) { /* captured */ }
  const rowDetectionMarkerPath = path.join(workspaceRoot, VALIDATION_DIR, ROW_DETECTION_MARKER);
  if (fs.existsSync(path.join(workspaceRoot, VALIDATION_DIR, 'phase-1-row-detection.json')) && !fs.existsSync(rowDetectionMarkerPath)) {
    missing.push('detect-header-rows.js RAN (.row-detection-complete) — phase-1 must be produced by the script');
  }
  if (!check(path.join(VALIDATION_DIR, 'phase-2-row-mapping.json'), 'phase-2-row-mapping.json')) { /* captured */ }
  if (!check(path.join(VALIDATION_DIR, 'phase-3-megamenu.json'), 'phase-3-megamenu.json')) { /* captured */ }
  if (!check(AGGREGATE, 'phase-5-aggregate.json')) { /* captured */ }
  if (!getNavFilePath(workspaceRoot)) missing.push('content/nav.plain.html');
  if (!check('blocks/header/header.css', 'header.css')) { /* captured */ }
  if (!check('blocks/header/header.js', 'header.js')) { /* captured */ }
  if (!check(path.join(VALIDATION_DIR, 'migrated-structural-summary.json'), 'migrated-structural-summary.json')) { /* captured */ }
  if (hasMegamenu(workspaceRoot)) {
    if (!check(path.join(VALIDATION_DIR, 'megamenu-mapping.json'), 'megamenu-mapping.json')) { /* captured */ }
    if (!check(path.join(VALIDATION_DIR, 'migrated-megamenu-mapping.json'), 'migrated-megamenu-mapping.json')) { /* captured */ }
    const panelLayoutRes = checkPanelLayoutMeasuredValues(workspaceRoot);
    if (panelLayoutRes.errors.length > 0) missing.push('panelLayoutDetails with measured values (getBoundingClientRect) in megamenu-mapping and migrated-megamenu-mapping');
  }
  if (!check(path.join(VALIDATION_DIR, '.nav-content-validated'), 'validate-nav-content.js RAN')) { /* captured */ }
  if (!check(SCHEMA_REGISTER, 'compare-structural-schema.js RAN (schema-register.json)')) { /* captured */ }
  if (hasMegamenu(workspaceRoot) && !check(MEGAMENU_BEHAVIOR_REGISTER, 'compare-megamenu-behavior.js RAN (megamenu-behavior-register.json)')) { /* captured */ }
  if (hasRowElements(workspaceRoot) && !check(ROW_ELEMENTS_BEHAVIOR_REGISTER, 'compare-row-elements-behavior.js RAN (row-elements-behavior-register.json)')) { /* captured */ }
  const headerAppearanceSourceExists = fs.existsSync(path.join(workspaceRoot, VALIDATION_DIR, 'header-appearance-mapping.json'));
  const migratedHeaderAppearanceExists = fs.existsSync(path.join(workspaceRoot, VALIDATION_DIR, 'migrated-header-appearance-mapping.json'));
  const migratedRowElementsExists = fs.existsSync(path.join(workspaceRoot, VALIDATION_DIR, 'migrated-row-elements-mapping.json'));
  const migratedMegamenuExists = fs.existsSync(path.join(workspaceRoot, VALIDATION_DIR, 'migrated-megamenu-mapping.json'));
  const headerAppearancePostImpl = (hasRowElements(workspaceRoot) && migratedRowElementsExists) || (hasMegamenu(workspaceRoot) && migratedMegamenuExists);
  if (headerAppearanceSourceExists && headerAppearancePostImpl && !check(path.join(VALIDATION_DIR, 'header-appearance-register.json'), 'compare-header-appearance.js RAN (header-appearance-register.json)')) { /* captured */ }
  const schemaReg = loadJson(path.join(workspaceRoot, SCHEMA_REGISTER));
  if (!schemaReg || !schemaReg.allValidated) missing.push('schema-register.json allValidated=true');
  if (hasMegamenu(workspaceRoot)) {
    const behaviorReg = loadJson(path.join(workspaceRoot, MEGAMENU_BEHAVIOR_REGISTER));
    if (!behaviorReg || !behaviorReg.allValidated) missing.push('megamenu-behavior-register.json allValidated=true');
  }
  if (hasRowElements(workspaceRoot)) {
    const rowBehaviorReg = loadJson(path.join(workspaceRoot, ROW_ELEMENTS_BEHAVIOR_REGISTER));
    if (!rowBehaviorReg || !rowBehaviorReg.allValidated) missing.push('row-elements-behavior-register.json allValidated=true');
  }
  if (headerAppearanceSourceExists && headerAppearancePostImpl) {
    const headerAppReg = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'header-appearance-register.json'));
    if (!headerAppReg || !headerAppReg.allValidated) missing.push('header-appearance-register.json allValidated=true');
  }
  if (!check(STYLE_REGISTER, 'style-register.json')) { /* captured */ }
  const phase4Exists = fs.existsSync(path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json'));
  if (phase4Exists) {
    // Combined critique (Step 13) runs ONCE after BOTH desktop AND mobile are complete.
    // Block critique until mobile implementation is fully done.
    if (!check(path.join(VALIDATION_DIR, 'phase-4-mobile.json'), 'phase-4-mobile.json')) { /* captured */ }
    const p4 = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json'));
    if (p4) {
      if (!p4.hamburgerAnimation) missing.push('phase-4-mobile.json: hamburgerAnimation field required — click hamburger icon, document animation');
      if (!p4.accordionBehavior) missing.push('phase-4-mobile.json: accordionBehavior field required — re-analyze mobile menu accordion/drawer behavior');
      if (!p4.overlayBehavior) missing.push('phase-4-mobile.json: overlayBehavior field required — check if source mobile menu has backdrop overlay');
    }
    if (!check(path.join(MOBILE_DIR, 'migrated-mobile-structural-summary.json'), 'mobile/migrated-mobile-structural-summary.json')) { /* captured */ }
    if (!check(MOBILE_SCHEMA_REGISTER, 'mobile/mobile-schema-register.json')) { /* captured */ }
    if (!check(path.join(MOBILE_DIR, 'mobile-heading-coverage.json'), 'mobile/mobile-heading-coverage.json')) { /* captured */ }
    if (!check(MOBILE_BEHAVIOR_REGISTER, 'mobile/mobile-behavior-register.json')) { /* captured */ }
    if (!check(MOBILE_STYLE_REGISTER, 'mobile/mobile-style-register.json')) { /* captured */ }
    const mobileSchemaReg = loadJson(path.join(workspaceRoot, MOBILE_SCHEMA_REGISTER));
    if (!mobileSchemaReg || !mobileSchemaReg.allValidated) missing.push('mobile/mobile-schema-register.json allValidated=true');
    const mobileBehaviorReg = loadJson(path.join(workspaceRoot, MOBILE_BEHAVIOR_REGISTER));
    if (!mobileBehaviorReg || !mobileBehaviorReg.allValidated) missing.push('mobile/mobile-behavior-register.json allValidated=true');
    const mobileHeadingCoverage = loadJson(path.join(workspaceRoot, MOBILE_HEADING_COVERAGE));
    if (mobileHeadingCoverage && !mobileHeadingCoverage.allCovered) missing.push('mobile/mobile-heading-coverage.json allCovered=true');
  }
  return { allPassed: missing.length === 0, missing };
}
