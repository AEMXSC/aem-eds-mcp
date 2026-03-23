/**
 * Shared helpers for nav-validation-gate.
 * Used by gate-table and main hook.
 */

import fs from 'fs';
import path from 'path';

export const VALIDATION_DIR = 'blocks/header/navigation-validation';
export const ROW_DETECTION_MARKER = '.row-detection-complete';
export const STYLE_REGISTER = path.join(VALIDATION_DIR, 'style-register.json');
export const SCHEMA_REGISTER = path.join(VALIDATION_DIR, 'schema-register.json');
export const MEGAMENU_BEHAVIOR_REGISTER = path.join(VALIDATION_DIR, 'megamenu-behavior-register.json');
export const ROW_ELEMENTS_BEHAVIOR_REGISTER = path.join(VALIDATION_DIR, 'row-elements-behavior-register.json');
export const HEADER_APPEARANCE_REGISTER = path.join(VALIDATION_DIR, 'header-appearance-register.json');
export const HEADER_APPEARANCE_MAPPING = path.join(VALIDATION_DIR, 'header-appearance-mapping.json');
export const AGGREGATE = path.join(VALIDATION_DIR, 'phase-5-aggregate.json');
export const DEBUG_LOG = path.join(VALIDATION_DIR, 'debug.log');
export const MOBILE_DIR = path.join(VALIDATION_DIR, 'mobile');
export const MOBILE_STYLE_REGISTER = path.join(MOBILE_DIR, 'mobile-style-register.json');
export const MOBILE_SCHEMA_REGISTER = path.join(MOBILE_DIR, 'mobile-schema-register.json');
export const MOBILE_BEHAVIOR_REGISTER = path.join(MOBILE_DIR, 'mobile-behavior-register.json');
export const MOBILE_HEADING_COVERAGE = path.join(MOBILE_DIR, 'mobile-heading-coverage.json');
/** Written by mobile-dimensional-gate.js when run with --validation-dir. Hook requires passed: true when phase-4 exists. */
export const MOBILE_DIMENSIONAL_GATE_REPORT = path.join(MOBILE_DIR, 'mobile-dimensional-gate-report.json');
/** Written by detect-mobile-structure.js. Hook requires this when phase-4 exists — programmatic row/item count before mobile structural validation. */
export const MOBILE_STRUCTURE_DETECTION_MARKER = path.join(MOBILE_DIR, '.mobile-structure-detection-complete');
export const MISSING_CONTENT_REGISTER = path.join(VALIDATION_DIR, 'missing-content-register.json');
export const MOBILE_MISSING_CONTENT_REGISTER = path.join(MOBILE_DIR, 'missing-content-register.json');
/** Written by audit-header-images.js on success. Gate blocks until expected vs actual image count passes. */
export const IMAGE_AUDIT_MARKER = path.join(VALIDATION_DIR, '.image-audit-passed');
export const IMAGE_AUDIT_REPORT = path.join(VALIDATION_DIR, 'image-audit-report.json');
/** Source/migrated image manifests and compare marker (audit-header-images.js --url and --compare). */
export const SOURCE_IMAGE_MANIFEST = path.join(VALIDATION_DIR, 'source-image-manifest.json');
export const MIGRATED_IMAGE_MANIFEST = path.join(VALIDATION_DIR, 'migrated-image-manifest.json');
export const IMAGE_MANIFEST_COMPARE_MARKER = path.join(VALIDATION_DIR, '.image-manifest-compare-passed');

export const SIMILARITY_THRESHOLD = 95;
/** Only markdown image syntax counts. No pipe-delimited, HTML img, or other formats. */
export const IMAGE_PATTERN = /!\[[^\]]*\]\([^)]+\)/;

export const BLOCK_REASON_PARITY_NOTE = '\n\nWe require 100% parity with the original site; this check is essential.';

export function blockReason(reason) {
  return reason + BLOCK_REASON_PARITY_NOTE;
}

export function loadJson(p) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (_) { /* ignore */ }
  return null;
}

export function hasRowElements(workspaceRoot) {
  const p2 = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-2-row-mapping.json'));
  if (!p2) return false;
  if (p2.rows && Array.isArray(p2.rows) && p2.rows.length > 0) return true;
  const p1 = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-1-row-detection.json'));
  if (p1 && p1.rowCount > 0) return true;
  return false;
}

export function hasMegamenu(workspaceRoot) {
  const mmExists = fs.existsSync(path.join(workspaceRoot, VALIDATION_DIR, 'megamenu-mapping.json'));
  if (mmExists) return true;
  const behaviorRegExists = fs.existsSync(path.join(workspaceRoot, MEGAMENU_BEHAVIOR_REGISTER));
  if (behaviorRegExists) return true;
  const p3 = loadJson(path.join(workspaceRoot, VALIDATION_DIR, 'phase-3-megamenu.json'));
  if (p3 && p3.columnCount && p3.columnCount > 0) return true;
  if (p3 && p3.triggerType && p3.triggerType !== '') return true;
  if (p3 && p3.nestedLevels && p3.nestedLevels > 0) return true;
  return false;
}

export function isNavContentFile(filePath) {
  if (!filePath) return false;
  const base = path.basename(filePath);
  return base === 'nav.plain.html';
}

/** Resolve nav file path. Only nav.plain.html is supported. Returns null if it does not exist. */
export function getNavFilePath(workspaceRoot) {
  const plainHtml = path.join(workspaceRoot, 'content', 'nav.plain.html');
  return fs.existsSync(plainHtml) ? plainHtml : null;
}

export function isHeaderFile(filePath) {
  if (!filePath) return false;
  return path.normalize(filePath).includes(path.join('blocks', 'header'));
}

export function isNavValidationFile(filePath) {
  if (!filePath) return false;
  return path.normalize(filePath).includes(path.join('blocks', 'header', 'navigation-validation'));
}

export function isStyleRegisterFile(filePath) {
  if (!filePath) return false;
  return path.basename(filePath) === 'style-register.json' && isNavValidationFile(filePath);
}

export function isMobileStyleRegisterFile(filePath) {
  if (!filePath) return false;
  return path.basename(filePath) === 'mobile-style-register.json' && filePath.includes('mobile');
}

export function isMobileFile(filePath) {
  if (!filePath) return false;
  return path.normalize(filePath).includes(path.join('navigation-validation', 'mobile'));
}

export function isCritiqueArtifactFile(filePath) {
  if (!filePath) return false;
  const norm = path.normalize(filePath).replace(/\\/g, '/');
  return norm.includes('navigation-validation/critique/') || norm.includes('navigation-validation/mobile/critique/');
}

export function isAggregateFile(filePath) {
  if (!filePath) return false;
  return path.basename(filePath) === 'phase-5-aggregate.json' && isNavValidationFile(filePath);
}

export function isMegamenuBehaviorRegisterFile(filePath) {
  if (!filePath) return false;
  return path.basename(filePath) === 'megamenu-behavior-register.json' && isNavValidationFile(filePath);
}

export function isRowElementsBehaviorRegisterFile(filePath) {
  if (!filePath) return false;
  return path.basename(filePath) === 'row-elements-behavior-register.json' && isNavValidationFile(filePath);
}

export function isMobileBehaviorRegisterFile(filePath) {
  if (!filePath) return false;
  return path.basename(filePath) === 'mobile-behavior-register.json' && filePath.includes('mobile');
}

export function detectPhase(workspaceRoot) {
  const hasP4 = fs.existsSync(path.join(workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json'));
  const hasDesktopConfirm = fs.existsSync(path.join(workspaceRoot, STYLE_REGISTER));
  const styleReg = loadJson(path.join(workspaceRoot, STYLE_REGISTER));
  const desktopDone = styleReg?.allValidated === true;
  if (hasP4) return 'MOBILE';
  if (desktopDone) return 'DESKTOP-CONFIRMED';
  return 'DESKTOP';
}
