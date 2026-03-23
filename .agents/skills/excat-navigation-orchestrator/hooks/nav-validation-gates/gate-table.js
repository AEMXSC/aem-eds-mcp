/**
 * Table-driven gate definitions for PostToolUse.
 * Each gate: { id, when(ctx), severity, check(ctx) => { pass, message?, blocks? } }
 * Order matters: gates run in array order; first failure returns.
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
  MOBILE_STYLE_REGISTER,
  MOBILE_SCHEMA_REGISTER,
  MOBILE_BEHAVIOR_REGISTER,
  MOBILE_HEADING_COVERAGE,
  MOBILE_STRUCTURE_DETECTION_MARKER,
  MOBILE_DIR,
  IMAGE_AUDIT_MARKER,
  loadJson,
  hasRowElements,
  hasMegamenu,
  isNavContentFile,
  isHeaderFile,
  isNavValidationFile,
  isStyleRegisterFile,
  isMobileStyleRegisterFile,
  isMobileFile,
  isCritiqueArtifactFile,
  isAggregateFile,
  isMegamenuBehaviorRegisterFile,
  isRowElementsBehaviorRegisterFile,
  isMobileBehaviorRegisterFile,
  getNavFilePath,
} from './helpers.js';
import {
  checkNavLocation,
  checkNavContentForImages,
  checkRowLandmarkParity,
  checkImageManifestParity,
  checkFeatureCardCompleteness,
  checkHeaderHeightSanity,
  checkCritiqueProof,
  checkMobileCritiqueProof,
  checkCritiquePrerequisites,
  checkDesktopComplete,
  checkStyleRegistersPrerequisites,
  checkMegamenuBehaviorRegisterShortcutNotes,
  checkRowElementsBehaviorRegisterShortcutNotes,
  checkMobileBehaviorRegisterShortcutNotes,
  checkMobileDimensionalGate,
  checkMobileAnimationSpeed,
  checkMissingContentRegister,
  checkMobileMissingContentRegister,
  checkPanelLayoutMeasuredValues,
  checkHeaderAppearanceMappingBeforeImplementation,
  checkHeaderBackgroundBehaviorTransparent,
} from './checks.js';

/** Run all PostToolUse gates; returns { decision: 'allow'|'block'|'warn', reason? } */
export function runPostToolUseGates(ctx, gates, log) {
  ctx.log = log;
  for (const gate of gates) {
    if (!gate.when(ctx)) continue;
    log('INFO', `Gate ${gate.id}: running...`);
    const result = gate.check(ctx);
    if (!result.pass) {
      const severity = result.severity || gate.severity;
      log(severity === 'warn' ? 'WARN' : 'BLOCK', `Gate ${gate.id} ${severity === 'warn' ? 'WARNING' : 'FAILED'}`, result.message ? [result.message.slice(0, 200) + '...'] : null);
      return { decision: severity, reason: result.message };
    }
  }
  return { decision: 'allow' };
}

/** Build context for gate checks */
export function buildContext(hookInput) {
  const filePath = hookInput?.tool_input?.file_path;
  const workspaceRoot = filePath ? (() => {
    let cur = path.resolve(path.dirname(filePath));
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
  })() : process.cwd();
  const relPath = filePath ? path.relative(workspaceRoot, filePath) : '';
  const basename = filePath ? path.basename(filePath) : '';
  return { filePath, workspaceRoot, relPath, basename, hookInput };
}

/** PostToolUse gates — run in order; first block/warn returns */
export const POST_TOOL_USE_GATES = [
  // Gate 18: [CRITIQUE] Block critique until all validation complete
  {
    id: '18',
    when: (ctx) => isCritiqueArtifactFile(ctx.filePath),
    severity: 'block',
    check: (ctx) => {
      const sessionFile = path.join(ctx.workspaceRoot, VALIDATION_DIR, 'session.json');
      if (!fs.existsSync(sessionFile)) return { pass: true };
      const { allPassed, missing } = checkCritiquePrerequisites(ctx.workspaceRoot);
      if (allPassed) return { pass: true };
      const msg = `🚫 [Nav Gate] BLOCKED — Cannot run critique until ALL validation milestones are complete.\n\n` +
        'Combined visual critique (Step 14) runs ONCE after BOTH desktop AND mobile are complete. Do NOT run critique before mobile implementation.\n\n' +
        'All checkboxes must be green first:\n\n' +
        '**Desktop:** session.json, phase-1/2/3, phase-5-aggregate, content/nav.plain.html, header.css/js, migrated-structural-summary, ' +
        'megamenu-mapping + migrated-megamenu-mapping (if megamenu), header-appearance-mapping + migrated (if created), validate-nav-content.js, compare-structural-schema.js, compare-megamenu-behavior.js (if megamenu), compare-row-elements-behavior.js, compare-header-appearance.js (if header-appearance-mapping exists), ' +
        'schema-register allValidated, megamenu-behavior-register allValidated (if megamenu), row-elements-behavior-register allValidated, header-appearance-register allValidated (if header-appearance-mapping exists), style-register.json\n\n' +
        '**Mobile:** phase-4-mobile.json, migrated-mobile-structural-summary, mobile-schema-register, mobile-heading-coverage, mobile-behavior-register, mobile-style-register, ' +
        'mobile-schema-register allValidated, mobile-behavior-register allValidated, mobile-heading-coverage allCovered\n\n' +
        `Missing (${missing.length}):\n` + missing.map((m, i) => `  ${i + 1}. ${m}`).join('\n') +
        '\n\nComplete ALL validation steps before invoking nav-component-critique.';
      return { pass: false, message: msg };
    },
  },

  // Gate 1: nav file location
  {
    id: '1',
    when: () => true,
    severity: 'block',
    check: (ctx) => {
      const err = checkNavLocation(ctx.filePath, ctx.workspaceRoot);
      if (err) return { pass: false, message: `🚫 [Nav Gate] ${err}` };
      return { pass: true };
    },
  },

  // Gate WORKFLOW_START_MESSAGE: session.json must have workflowStartMessageDisplayed: true
  {
    id: 'WORKFLOW_START_MESSAGE',
    when: (ctx) => ctx.basename === 'session.json',
    severity: 'block',
    check: (ctx) => {
      const sessionPath = path.isAbsolute(ctx.filePath) ? ctx.filePath : path.join(ctx.workspaceRoot, ctx.filePath);
      const session = loadJson(sessionPath);
      if (!session || session.workflowStartMessageDisplayed !== true) {
        const msg = `🚫 [Nav Gate] session.json was written without workflowStartMessageDisplayed: true.\n\n` +
          'You MUST display the workflow start message to the user BEFORE writing session.json.\n\n' +
          '1. Read references/workflow-start-message.md and output its contents to the user (intro + 10-step overview).\n' +
          '2. Then write session.json with sourceUrl, migratedPath, startedAt, and workflowStartMessageDisplayed: true.\n\n' +
          'Do not write session.json until you have shown the user that message.';
        return { pass: false, message: msg };
      }
      return { pass: true };
    },
  },

  // Gate ROW_LANDMARK_PARITY: phase-2 must have rows.length >= phase-1.rowCount
  {
    id: 'ROW_LANDMARK_PARITY',
    when: (ctx) => ctx.basename === 'phase-2-row-mapping.json',
    severity: 'block',
    check: (ctx) => {
      const err = checkRowLandmarkParity(ctx.workspaceRoot);
      if (err) return { pass: false, message: `🚫 [Nav Gate] ${err}` };
      return { pass: true };
    },
  },

  // Gate HEADER_HEIGHT_SANITY: phase-1 heightMismatch blocks further progress
  {
    id: 'HEADER_HEIGHT_SANITY',
    when: (ctx) => ctx.basename === 'phase-2-row-mapping.json' || ctx.basename === 'phase-1-row-detection.json',
    severity: 'block',
    check: (ctx) => {
      const err = checkHeaderHeightSanity(ctx.workspaceRoot);
      if (err) return { pass: false, message: `🚫 [Nav Gate] ${err}` };
      return { pass: true };
    },
  },

  // Gate FEATURE_CARD_COMPLETENESS: megamenu-mapping must document featureCards when source has bgImages
  {
    id: 'FEATURE_CARD_COMPLETENESS',
    when: (ctx) => ctx.basename === 'megamenu-mapping.json',
    severity: 'block',
    check: (ctx) => {
      const err = checkFeatureCardCompleteness(ctx.workspaceRoot);
      if (err) return { pass: false, message: `🚫 [Nav Gate] ${err}` };
      return { pass: true };
    },
  },

  // Gate IMAGE_PARITY: when both manifests exist, compare must have passed
  {
    id: 'IMAGE_PARITY',
    when: (ctx) => ctx.basename === 'migrated-image-manifest.json' || ctx.basename === 'source-image-manifest.json',
    severity: 'block',
    check: (ctx) => {
      const err = checkImageManifestParity(ctx.workspaceRoot);
      if (err) return { pass: false, message: `🚫 [Nav Gate] ${err}` };
      return { pass: true };
    },
  },

  // Gate 2: nav content images
  {
    id: '2',
    when: () => true,
    severity: 'block',
    check: (ctx) => {
      const err = checkNavContentForImages(ctx.filePath, ctx.workspaceRoot);
      if (err) return { pass: false, message: `🚫 [Nav Gate] ${err}` };
      return { pass: true };
    },
  },

  // Gate 19: Block style-register and mobile-style-register until desktop + mobile validation complete
  {
    id: '19',
    when: (ctx) => isStyleRegisterFile(ctx.filePath) || isMobileStyleRegisterFile(ctx.filePath),
    severity: 'block',
    check: (ctx) => {
      const sessionFile = path.join(ctx.workspaceRoot, VALIDATION_DIR, 'session.json');
      if (!fs.existsSync(sessionFile)) return { pass: true };
      const { allPassed, missing } = checkStyleRegistersPrerequisites(ctx.workspaceRoot);
      if (allPassed) return { pass: true };
      const regName = isMobileStyleRegisterFile(ctx.filePath) ? 'mobile-style-register.json' : 'style-register.json';
      const msg = `🚫 [Nav Gate] BLOCKED — Cannot build ${regName} until ALL desktop AND mobile validation is complete.\n\n` +
        'Step 13 (Build Style Registers) runs ONLY after:\n\n' +
        '**Desktop:** migrated-megamenu-mapping, megamenu-behavior-register allValidated, schema-register allValidated, row-elements-behavior-register allValidated, header-appearance-register allValidated (if mapping exists)\n\n' +
        '**Mobile:** phase-4-mobile.json, migrated-mobile-structural-summary, mobile-schema-register allValidated, mobile-heading-coverage allCovered, mobile-behavior-register allValidated, mobile missing-content-register all resolved\n\n' +
        `Missing (${missing.length}):\n` + missing.map((m, i) => `  ${i + 1}. ${m}`).join('\n') +
        '\n\nComplete ALL validation steps before building style registers.';
      return { pass: false, message: msg };
    },
  },

  // Gate 20: Block megamenu-behavior-register when validated items have notes describing mismatches (LLM shortcut)
  {
    id: '20',
    when: (ctx) => isMegamenuBehaviorRegisterFile(ctx.filePath),
    severity: 'block',
    check: (ctx) => {
      const { pass, shortcutItems } = checkMegamenuBehaviorRegisterShortcutNotes(ctx.workspaceRoot);
      if (pass) return { pass: true };
      const msg = `🚫 [Nav Gate] BLOCKED — megamenu-behavior-register.json has items marked "validated" with notes describing source vs migrated differences.\n\n` +
        'A note (e.g. "not included in EDS", "source has X but migrated uses Y") suggests a shortcut — documenting the mismatch instead of fixing it.\n\n' +
        'Do NOT mark items validated when they have such notes. Fix the implementation to match source; then remove the note.\n\n' +
        `Items with shortcut notes (${shortcutItems.length}):\n` +
        shortcutItems.map((s, i) => `  ${i + 1}. ${s.id} (${s.label}): "${(s.note || '').slice(0, 80)}..."`).join('\n') +
        '\n\nAdd missing content/structure to nav.plain.html and header.js — do not shortcut.';
      return { pass: false, message: msg };
    },
  },

  // Gate 20b: Block row-elements-behavior-register when validated items have notes describing mismatches (LLM shortcut)
  {
    id: '20b',
    when: (ctx) => isRowElementsBehaviorRegisterFile(ctx.filePath),
    severity: 'block',
    check: (ctx) => {
      const { pass, shortcutItems } = checkRowElementsBehaviorRegisterShortcutNotes(ctx.workspaceRoot);
      if (pass) return { pass: true };
      const msg = `🚫 [Nav Gate] BLOCKED — row-elements-behavior-register.json has items marked "validated" with notes describing source vs migrated differences.\n\n` +
        'A note (e.g. "not included in EDS", "source has X but migrated uses Y") suggests a shortcut — documenting the mismatch instead of fixing it.\n\n' +
        'Do NOT mark items validated when they have such notes. Fix the implementation to match source; then remove the note.\n\n' +
        `Items with shortcut notes (${shortcutItems.length}):\n` +
        shortcutItems.map((s, i) => `  ${i + 1}. ${s.id} (${s.label}): "${(s.note || '').slice(0, 80)}..."`).join('\n') +
        '\n\nFix row element hover/click behavior in header.js/header.css — do not shortcut.';
      return { pass: false, message: msg };
    },
  },

  // Gate 20c: Block mobile-behavior-register when validated items have notes describing mismatches (LLM shortcut)
  {
    id: '20c',
    when: (ctx) => isMobileBehaviorRegisterFile(ctx.filePath),
    severity: 'block',
    check: (ctx) => {
      const { pass, shortcutItems } = checkMobileBehaviorRegisterShortcutNotes(ctx.workspaceRoot);
      if (pass) return { pass: true };
      const msg = `🚫 [Nav Gate] BLOCKED — mobile/mobile-behavior-register.json has items marked "validated" with notes describing source vs migrated differences.\n\n` +
        'A note (e.g. "not included in EDS", "source has X but migrated uses Y") suggests a shortcut — documenting the mismatch instead of fixing it.\n\n' +
        'Do NOT mark items validated when they have such notes. Fix the mobile implementation to match source; then remove the note.\n\n' +
        `Items with shortcut notes (${shortcutItems.length}):\n` +
        shortcutItems.map((s, i) => `  ${i + 1}. ${s.id} (${s.label || ''}): "${(s.note || '').slice(0, 80)}..."`).join('\n') +
        '\n\nFix mobile tap/behavior/animation in header.js/header.css @media — do not shortcut.';
      return { pass: false, message: msg };
    },
  },

  // Gate 3 + 4: style-register critique proof + prerequisites
  {
    id: '3-4',
    when: (ctx) => isStyleRegisterFile(ctx.filePath),
    severity: 'block',
    check: (ctx) => {
      const critiqueErrors = checkCritiqueProof(ctx.workspaceRoot);
      if (critiqueErrors.length > 0) {
        const msg = `🚫 [Nav Gate] style-register.json has components marked "validated" WITHOUT critique proof:\n\n` +
          critiqueErrors.map((e, i) => `  ${i + 1}. ${e}`).join('\n') +
          '\n\nThe nav-component-critique sub-skill must ACTUALLY RUN and produce screenshots + report.';
        return { pass: false, message: msg };
      }
      const prereqErrors = [];
      if (hasMegamenu(ctx.workspaceRoot) && !fs.existsSync(path.join(ctx.workspaceRoot, MEGAMENU_BEHAVIOR_REGISTER))) {
        prereqErrors.push('megamenu-behavior-register.json does NOT exist. Per SKILL step 4, run compare-megamenu-behavior.js BEFORE writing style-register.');
      }
      if (hasRowElements(ctx.workspaceRoot)) {
        const rowRegPath = path.join(ctx.workspaceRoot, ROW_ELEMENTS_BEHAVIOR_REGISTER);
        if (!fs.existsSync(rowRegPath)) {
          prereqErrors.push('row-elements-behavior-register.json does NOT exist. Per SKILL step 4b, create row-elements-mapping and migrated-row-elements-mapping, then run compare-row-elements-behavior.js BEFORE writing style-register.');
        } else {
          const rowReg = loadJson(rowRegPath);
          if (rowReg && !rowReg.allValidated) prereqErrors.push('row-elements-behavior-register.json allValidated is not true.');
        }
      }
      if (!fs.existsSync(path.join(ctx.workspaceRoot, SCHEMA_REGISTER))) {
        prereqErrors.push('schema-register.json does NOT exist. Per SKILL step 5, run compare-structural-schema.js --output-register BEFORE writing style-register.');
      }
      if (prereqErrors.length > 0) {
        const msg = `🚫 [Nav Gate] style-register.json written but prerequisite validation steps were SKIPPED:\n\n` +
          prereqErrors.map((e, i) => `  ${i + 1}. ${e}`).join('\n') +
          '\n\nYou MUST complete these validation steps in order before building the style register.';
        return { pass: false, message: msg };
      }
      return { pass: true };
    },
  },

  // Gate 5: phase-5-aggregate with incomplete style-register
  {
    id: '5',
    when: (ctx) => isAggregateFile(ctx.filePath),
    severity: 'block',
    check: (ctx) => {
      const styleReg = loadJson(path.join(ctx.workspaceRoot, STYLE_REGISTER));
      if (!styleReg) return { pass: true };
      const components = styleReg.components || [];
      const zeroCount = components.filter(c => (c.lastSimilarity || 0) === 0).length;
      if (zeroCount === components.length && components.length > 0) {
        const msg = `🚫 [Nav Gate] phase-5-aggregate.json updated, but style-register.json has ALL ${components.length} components at 0% similarity.\n\n` +
          'Per-component critique (nav-component-critique sub-skill) has NOT been run.\n' +
          'You MUST invoke nav-component-critique for EACH pending component BEFORE updating the aggregate.';
        return { pass: false, message: msg };
      }
      return { pass: true };
    },
  },

  // Gate 6: Mandatory script enforcement (6a–6j)
  {
    id: '6',
    when: (ctx) => isHeaderFile(ctx.filePath) || isNavContentFile(ctx.filePath) || isNavValidationFile(ctx.filePath),
    severity: 'block',
    check: (ctx) => {
      const sessionFile = path.join(ctx.workspaceRoot, VALIDATION_DIR, 'session.json');
      if (!fs.existsSync(sessionFile)) return { pass: true };
      const blocks = [];
      const wr = ctx.workspaceRoot;

      // 6a0: phase-1 and phase-2 require detect-header-rows.js run first
      const phase1Exists = fs.existsSync(path.join(wr, VALIDATION_DIR, 'phase-1-row-detection.json'));
      const rowDetectionComplete = fs.existsSync(path.join(wr, VALIDATION_DIR, ROW_DETECTION_MARKER));
      if (phase1Exists && !rowDetectionComplete) {
        ctx.log?.('INFO', '[ROW-DETECTION] Gate 6a0: phase-1 exists but detect-header-rows.js not run — blocking');
        blocks.push('phase-1-row-detection.json exists but detect-header-rows.js has NOT been run.\n  → Run FIRST: node scripts/detect-header-rows.js --url=<source-url> [--validation-dir=blocks/header/navigation-validation]\n  The script uses Playwright to count header rows programmatically (getBoundingClientRect, getComputedStyle). Never set rowCount from screenshot alone. The script writes phase-1 and .row-detection-complete. Until that marker exists, phase-1 is invalid.');
      }
      if (ctx.basename === 'phase-1-row-detection.json' && !rowDetectionComplete) {
        ctx.log?.('INFO', '[ROW-DETECTION] Gate 6a0: cannot write phase-1 without running detect-header-rows.js first');
        blocks.push('Do NOT write phase-1-row-detection.json manually. Run detect-header-rows.js first:\n  → node scripts/detect-header-rows.js --url=<source-url>\n  The script produces phase-1 from programmatic measurement. Screenshot-based row count misses small rows (e.g. 40px utility bar).');
      }
      if (ctx.basename === 'phase-2-row-mapping.json' && !rowDetectionComplete) {
        ctx.log?.('INFO', '[ROW-DETECTION] Gate 6a0: cannot write phase-2 until detect-header-rows.js has run');
        blocks.push('Do NOT write phase-2-row-mapping.json until Phase 1 is produced by the script.\n  → Run FIRST: node scripts/detect-header-rows.js --url=<source-url>\n  Then proceed to Phase 2 (row element mapping).');
      }

      // 6a-mobile: block mobile files until desktop complete and phase-4 exists
      if (isMobileFile(ctx.filePath)) {
        const phase4Exists = fs.existsSync(path.join(wr, VALIDATION_DIR, 'phase-4-mobile.json'));
        if (!phase4Exists) {
          blocks.push('[MOBILE] Cannot create mobile validation files until phase-4-mobile.json exists.\n  → Complete desktop implementation + validation, request customer confirmation, then create phase-4-mobile.json.');
        } else {
          const desktopResult = checkDesktopComplete(wr);
          if (!desktopResult.pass) {
            blocks.push(`[MOBILE] Cannot create mobile files until desktop validation is complete.\n  → ${desktopResult.message}`);
          }
        }
      }

      // 6a
      const navFilePath = getNavFilePath(wr);
      const navValidated = fs.existsSync(path.join(wr, VALIDATION_DIR, '.nav-content-validated'));
      if (navFilePath && !navValidated && !isNavContentFile(ctx.filePath)) {
        const navRel = path.relative(wr, navFilePath);
        const navBasename = path.basename(navFilePath);
        blocks.push(`${navRel} exists but validate-nav-content.js has NOT been run.\n  → Run NOW: node scripts/validate-nav-content.js content/${navBasename} blocks/header/navigation-validation\n  The script writes a marker file (.nav-content-validated) on success. Until that marker exists, further edits are blocked.`);
      }

      // 6a2: image audit — expected vs actual header images (phase-2/3 + megamenu-mapping vs nav + on-disk)
      const imageAuditPassed = fs.existsSync(path.join(wr, IMAGE_AUDIT_MARKER));
      if (navFilePath && navValidated && !imageAuditPassed && !isNavContentFile(ctx.filePath)) {
        blocks.push(`validate-nav-content.js passed but audit-header-images.js has NOT been run.\n  → Run NOW: node scripts/audit-header-images.js content/nav.plain.html blocks/header/navigation-validation\n  The script compares expected image count (from phase-2, phase-3, megamenu-mapping) to images referenced in nav and on disk. If there is a gap, it reports where the miss is (e.g. megamenu feature cards). Fix missing downloads, re-run validate-nav-content.js then audit-header-images.js.`);
      }

      // 6b
      const migratedMmExists = fs.existsSync(path.join(wr, VALIDATION_DIR, 'migrated-megamenu-mapping.json'));
      const behaviorRegExists = fs.existsSync(path.join(wr, MEGAMENU_BEHAVIOR_REGISTER));
      if (migratedMmExists && !behaviorRegExists && hasMegamenu(wr)) {
        if (ctx.basename !== 'migrated-megamenu-mapping.json') {
          blocks.push('migrated-megamenu-mapping.json exists but compare-megamenu-behavior.js has NOT been run.\n  → Run NOW: node scripts/compare-megamenu-behavior.js blocks/header/navigation-validation/megamenu-mapping.json blocks/header/navigation-validation/migrated-megamenu-mapping.json --output=blocks/header/navigation-validation/megamenu-behavior-register.json');
        }
      }

      // 6c
      const migratedStructExists = fs.existsSync(path.join(wr, VALIDATION_DIR, 'migrated-structural-summary.json'));
      const schemaRegExists = fs.existsSync(path.join(wr, SCHEMA_REGISTER));
      if (migratedStructExists && !schemaRegExists && ctx.basename !== 'migrated-structural-summary.json') {
        blocks.push('migrated-structural-summary.json exists but compare-structural-schema.js has NOT been run.\n  → Run NOW: node scripts/compare-structural-schema.js blocks/header/navigation-validation/phase-1-row-detection.json blocks/header/navigation-validation/phase-2-row-mapping.json blocks/header/navigation-validation/phase-3-megamenu.json blocks/header/navigation-validation/migrated-structural-summary.json --threshold=95 --output-register=blocks/header/navigation-validation/schema-register.json');
      }

      // 6d removed: style-register is built at critique step; do not block CSS edits for pending components

      // 6e
      const phase4File = path.join(wr, VALIDATION_DIR, 'phase-4-mobile.json');
      const isHeaderImpl = ctx.basename === 'header.css' || ctx.basename === 'header.js';
      if (fs.existsSync(phase4File) && isHeaderImpl) {
        const p4 = loadJson(phase4File);
        if (p4 && !p4.hamburgerAnimation) {
          blocks.push('phase-4-mobile.json exists but hamburgerAnimation field is MISSING.\n  → Re-run mobile analysis: click the hamburger icon, document the animation type/method/transition.');
        }
      }

      // 6e: mobile structure detection (same as desktop — programmatic row/item count before structural validation)
      const phase4ExistsForMobile = fs.existsSync(path.join(wr, VALIDATION_DIR, 'phase-4-mobile.json'));
      if (phase4ExistsForMobile && !fs.existsSync(path.join(wr, MOBILE_STRUCTURE_DETECTION_MARKER))) {
        blocks.push('[MOBILE] detect-mobile-structure.js has NOT been run.\n  → Run FIRST: node scripts/detect-mobile-structure.js --url=<source-url> [--validation-dir=blocks/header/navigation-validation] (viewport 375×812). Same as desktop: programmatic row and item count before mobile structural validation. Writes mobile/mobile-structure-detection.json and .mobile-structure-detection-complete.');
      }

      // 6f
      const mobileMigratedStructExists = fs.existsSync(path.join(wr, MOBILE_DIR, 'migrated-mobile-structural-summary.json'));
      const mobileSchemaRegExists = fs.existsSync(path.join(wr, MOBILE_SCHEMA_REGISTER));
      if (mobileMigratedStructExists && !mobileSchemaRegExists && ctx.basename !== 'migrated-mobile-structural-summary.json') {
        blocks.push('[MOBILE] migrated-mobile-structural-summary.json exists but mobile-schema-register.json does NOT.\n  → Run: node scripts/compare-mobile-structural-schema.js blocks/header/navigation-validation/mobile/mobile-structure-detection.json blocks/header/navigation-validation/mobile/migrated-mobile-structural-summary.json --output-register=blocks/header/navigation-validation/mobile/mobile-schema-register.json');
      }

      // 6g removed: mobile-style-register is built at critique step; do not block CSS edits for pending components

      // 6h
      const phase4Exists = fs.existsSync(phase4File);
      const headingCovExists = fs.existsSync(path.join(wr, MOBILE_HEADING_COVERAGE));
      const mobileBehaviorRegExists = fs.existsSync(path.join(wr, MOBILE_BEHAVIOR_REGISTER));
      if (phase4Exists && !headingCovExists && !isMobileFile(ctx.filePath)) {
        const mobileSchemaExists = fs.existsSync(path.join(wr, MOBILE_SCHEMA_REGISTER));
        if (mobileSchemaExists) {
          blocks.push('[MOBILE] Mobile schema register exists but mobile-heading-coverage.json does NOT.\n  → Open mobile menu at 375×812 and click EVERY top-level heading. Record results in mobile/mobile-heading-coverage.json with allCovered: true.');
        }
      }

      // 6i
      const migratedRowElementsExists = fs.existsSync(path.join(wr, VALIDATION_DIR, 'migrated-row-elements-mapping.json'));
      const rowElementsBehaviorRegExists = fs.existsSync(path.join(wr, ROW_ELEMENTS_BEHAVIOR_REGISTER));
      if (migratedRowElementsExists && !rowElementsBehaviorRegExists && hasRowElements(wr) && ctx.basename !== 'migrated-row-elements-mapping.json') {
        blocks.push('migrated-row-elements-mapping.json exists but compare-row-elements-behavior.js has NOT been run.\n  → Run NOW: node scripts/compare-row-elements-behavior.js blocks/header/navigation-validation/row-elements-mapping.json blocks/header/navigation-validation/migrated-row-elements-mapping.json --output=blocks/header/navigation-validation/row-elements-behavior-register.json');
      }

      // 6j
      if (ctx.basename === 'migrated-structural-summary.json' && hasRowElements(wr)) {
        const rowReg = loadJson(path.join(wr, ROW_ELEMENTS_BEHAVIOR_REGISTER));
        if (!rowReg || !rowReg.allValidated) {
          blocks.push('Row elements behavior validation (Step 5a) must complete BEFORE structural validation (Step 6).\n  → Create row-elements-mapping.json (hover/click every row element on SOURCE), then migrated-row-elements-mapping.json (on MIGRATED page),\n  → Run: node scripts/compare-row-elements-behavior.js ... --output=row-elements-behavior-register.json\n  → Require row-elements-behavior-register.json allValidated: true before writing migrated-structural-summary.json.');
        }
      }

      // 6k: header appearance — POSTPONED until post-implementation (migrated-row-elements or migrated-megamenu exists)
      const headerAppearanceSourceExists = fs.existsSync(path.join(wr, VALIDATION_DIR, 'header-appearance-mapping.json'));
      const migratedHeaderAppearanceExists = fs.existsSync(path.join(wr, VALIDATION_DIR, 'migrated-header-appearance-mapping.json'));
      const headerAppearanceRegExists = fs.existsSync(path.join(wr, HEADER_APPEARANCE_REGISTER));
      const migratedMegamenuExists = fs.existsSync(path.join(wr, VALIDATION_DIR, 'migrated-megamenu-mapping.json'));
      const headerAppearancePostImpl = (hasRowElements(wr) && migratedRowElementsExists) || (hasMegamenu(wr) && migratedMegamenuExists);
      if (headerAppearanceSourceExists && ctx.basename !== 'header-appearance-mapping.json') {
        if (migratedHeaderAppearanceExists && !headerAppearancePostImpl) {
          blocks.push('migrated-header-appearance-mapping.json was created prematurely. Delete it. Create it only AFTER implementing the desktop header and creating migrated-row-elements-mapping.json (or migrated-megamenu-mapping.json if megamenu).');
        } else if (headerAppearancePostImpl) {
          if (!migratedHeaderAppearanceExists) {
            blocks.push('header-appearance-mapping.json exists but migrated-header-appearance-mapping.json does NOT.\n  → On the migrated page, test: does the header bar change (background, shadow, border) when hovering nav items or when megamenu is open? Create migrated-header-appearance-mapping.json with same schema (including headerBackgroundBehavior).');
          } else if (!headerAppearanceRegExists && ctx.basename !== 'migrated-header-appearance-mapping.json') {
            blocks.push('migrated-header-appearance-mapping.json exists but compare-header-appearance.js has NOT been run.\n  → Run NOW: node scripts/compare-header-appearance.js blocks/header/navigation-validation/header-appearance-mapping.json blocks/header/navigation-validation/migrated-header-appearance-mapping.json --output=blocks/header/navigation-validation/header-appearance-register.json');
          }
        }
      }

      // 6l: missing content register — block until all omissions resolved
      const missingContentResult = checkMissingContentRegister(wr);
      if (missingContentResult.errors.length > 0) {
        ctx.log?.('INFO', `[MISSING-CONTENT] Gate 6l: ${missingContentResult.errors.length} unresolved omission(s)`, missingContentResult.errors);
        blocks.push('missing-content-register.json has unresolved content omissions.\n  → Add the missing content to content/nav.plain.html. Extract the exact styles from the source site so we match them precisely. Update missing-content-register.json: set resolved: true for each added item. Re-run validate-nav-content.js.\n  → Unresolved: ' + missingContentResult.errors.map((e) => e.split(' — ')[0]).join('; '));
      }

      // 6m: mobile missing content register — block when phase4 exists and mobile has unresolved omissions
      if (phase4Exists) {
        const mobileMissingResult = checkMobileMissingContentRegister(wr);
        if (mobileMissingResult.errors.length > 0) {
          ctx.log?.('INFO', `[MOBILE-MISSING-CONTENT] Gate 6m: ${mobileMissingResult.errors.length} unresolved omission(s)`, mobileMissingResult.errors);
          blocks.push('[MOBILE] mobile/missing-content-register.json has unresolved content omissions.\n  → Add mobile-only content to nav.plain.html in a mobile-only section. Extract the exact styles from the source site so we match them precisely. In header.css, hide on desktop (display:none default), show in @media for mobile. Set resolved: true in mobile/missing-content-register.json.\n  → Unresolved: ' + mobileMissingResult.errors.map((e) => e.split(' — ')[0]).join('; '));
        }
      }

      // 6n: panel layout measured values — block when megamenu/dropdown exists but panelLayoutDetails lacks measured values (getBoundingClientRect)
      const panelLayoutResult = checkPanelLayoutMeasuredValues(wr);
      if (panelLayoutResult.errors.length > 0) {
        ctx.log?.('INFO', `[PANEL-LAYOUT] Gate 6n: ${panelLayoutResult.errors.length} error(s)`, panelLayoutResult.errors);
        blocks.push('megamenu-mapping.json or migrated-megamenu-mapping.json has panel triggers without measured values.\n  → For each trigger with panelType megamenu/dropdown/flyout: open panel, run getBoundingClientRect() on panel element, add measuredLeft, measuredRight, viewportWidth to panelLayoutDetails. Test at 1440, 1920, 1366, 1280, 1024px. Add cssPosition, cssLeft, cssWidth from getComputedStyle. Re-run compare-megamenu-behavior.js.\n  → Errors: ' + panelLayoutResult.errors.map((e) => e.split(' — ')[0] || e.slice(0, 60)).join('; '));
      }

      // 6o: header-appearance-mapping (source) REQUIRED before header.css — Phase 2 pre-implementation
      if (isHeaderImpl) {
        const mappingBeforeResult = checkHeaderAppearanceMappingBeforeImplementation(wr);
        if (!mappingBeforeResult.pass) {
          ctx.log?.('INFO', '[HEADER-APPEARANCE] Gate 6o: header-appearance-mapping.json (source) required before header.css — create in Phase 2');
          blocks.push(mappingBeforeResult.message);
        }
      }

      // 6p: when defaultState === "transparent", block header.css if it sets background-color on .nav-wrapper
      if (ctx.basename === 'header.css') {
        const transparentResult = checkHeaderBackgroundBehaviorTransparent(wr);
        if (!transparentResult.pass) {
          ctx.log?.('INFO', '[HEADER-APPEARANCE] Gate 6p: transparent header but header.css sets background-color on .nav-wrapper — use transparent template');
          blocks.push(transparentResult.message);
        }
      }

      if (blocks.length > 0) {
        const msg = `🚫 [Nav Gate] BLOCKED — ${blocks.length} mandatory step(s) were skipped:\n\n` + blocks.map((b, i) => `${i + 1}. ${b}`).join('\n\n') + '\n\nRun the required script(s) BEFORE continuing with other edits.';
        return { pass: false, message: msg };
      }
      return { pass: true };
    },
  },

  // Gate 10: phase-4-mobile.json blocked if desktop incomplete (structural + behavior only; style-register is built at critique step)
  {
    id: '10',
    when: (ctx) => ctx.basename === 'phase-4-mobile.json',
    severity: 'block',
    check: (ctx) => {
      const result = checkDesktopComplete(ctx.workspaceRoot);
      if (!result.pass) {
        return { pass: false, message: `🚫 [Nav Gate] BLOCKED — Cannot start mobile phase while desktop validation is INCOMPLETE.\n\n${result.message}\n\nComplete ALL desktop structural + behavior validation (megamenu-behavior-register, schema-register, row-elements-behavior-register, header-appearance-register) BEFORE starting Phase 4 mobile.` };
      }
      return { pass: true };
    },
  },

  // Gate 11: phase-2-row-mapping.json — hamburger, hasSearchForm, hasLocaleSelector
  {
    id: '11',
    when: (ctx) => ctx.basename === 'phase-2-row-mapping.json',
    severity: 'block',
    check: (ctx) => {
      const p2 = loadJson(ctx.filePath);
      if (!p2?.rows) return { pass: true };
      const rowsMissingHamburger = p2.rows.filter(r => r.hasHamburgerIcon === undefined);
      if (rowsMissingHamburger.length > 0) {
        return { pass: false, message: `🚫 [Nav Gate] BLOCKED — phase-2-row-mapping.json has ${rowsMissingHamburger.length} row(s) missing the hasHamburgerIcon field.\n\nEvery row MUST include hasHamburgerIcon (true/false). If true, also include hamburgerClickBehavior and hamburgerAnimation.\nClick the hamburger/breadcrumb icon in the header to test its behavior before writing phase-2.` };
      }
      const rowsWithHamburger = p2.rows.filter(r => r.hasHamburgerIcon === true);
      for (const row of rowsWithHamburger) {
        const missing = [];
        if (!row.hamburgerClickBehavior) missing.push('hamburgerClickBehavior');
        if (!row.hamburgerAnimation) missing.push('hamburgerAnimation');
        if (!row.hamburgerHoverEffect && row.hamburgerHoverEffect !== null) missing.push('hamburgerHoverEffect (set to null if no hover effect)');
        if (missing.length > 0) {
          return { pass: false, message: `🚫 [Nav Gate] BLOCKED — hasHamburgerIcon=true but click/hover/animation not fully documented:\n  Row ${row.index}: missing ${missing.join(', ')}\n\nYou MUST click AND hover the hamburger icon and record hamburgerClickBehavior, hamburgerAnimation, hamburgerHoverEffect.` };
        }
      }
      const rowsMissingSearch = p2.rows.filter(r => r.hasSearchForm === undefined);
      if (rowsMissingSearch.length > 0) {
        return { pass: false, message: `🚫 [Nav Gate] BLOCKED — phase-2-row-mapping.json has ${rowsMissingSearch.length} row(s) missing the hasSearchForm field.\n\nEvery row MUST include hasSearchForm (true/false). If hasSearchForm is true, also include searchFormDetails with formType, inputPlaceholder, and position.` };
      }
      const rowsWithSearch = p2.rows.filter(r => r.hasSearchForm === true);
      const incompleteSearchRows = rowsWithSearch.filter(r => !r.searchFormDetails || !r.searchFormDetails.formType);
      if (incompleteSearchRows.length > 0) {
        return { pass: false, severity: 'warn', message: `⚠️ [Nav Gate] WARNING — hasSearchForm=true but searchFormDetails incomplete:\n\n` + incompleteSearchRows.map(r => `  Row ${r.index}: missing searchFormDetails.formType`).join('\n') + '\n\nPopulate searchFormDetails: formType (inline-input|expandable-icon|modal-overlay|dropdown-panel), inputPlaceholder, position.' };
      }
      const rowsMissingLocale = p2.rows.filter(r => r.hasLocaleSelector === undefined);
      if (rowsMissingLocale.length > 0) {
        return { pass: false, message: `🚫 [Nav Gate] BLOCKED — phase-2-row-mapping.json has ${rowsMissingLocale.length} row(s) missing the hasLocaleSelector field.\n\nEvery row MUST include hasLocaleSelector (true/false). If true, include localeSelectorDetails with selectorType, triggerElement, hasFlags, and dropdownLayout.` };
      }
      const rowsWithLocale = p2.rows.filter(r => r.hasLocaleSelector === true);
      const incompleteLocaleRows = rowsWithLocale.filter(r => !r.localeSelectorDetails || !r.localeSelectorDetails.selectorType);
      if (incompleteLocaleRows.length > 0) {
        return { pass: false, severity: 'warn', message: `⚠️ [Nav Gate] WARNING — hasLocaleSelector=true but localeSelectorDetails incomplete:\n\n` + incompleteLocaleRows.map(r => `  Row ${r.index}: missing localeSelectorDetails.selectorType`).join('\n') + '\n\nPopulate localeSelectorDetails: selectorType, triggerElement, triggerBehavior, hasFlags, dropdownLayout, entryCount, position.' };
      }
      return { pass: true };
    },
  },

  // Gate 16/17: phase-3-megamenu.json — hasSearchForm, hasLocaleSelector
  {
    id: '16-17',
    when: (ctx) => ctx.basename === 'phase-3-megamenu.json',
    severity: 'block',
    check: (ctx) => {
      const p3 = loadJson(ctx.filePath);
      const megamenuExists = p3 && ((p3.columnCount && p3.columnCount > 0) || (p3.triggerType && p3.triggerType !== '') || (p3.nestedLevels && p3.nestedLevels > 0));
      if (!megamenuExists) return { pass: true };
      if (p3.hasSearchForm === undefined) {
        return { pass: false, message: '🚫 [Nav Gate] BLOCKED — phase-3-megamenu.json is missing the hasSearchForm field.\n\nWhen a megamenu exists, you MUST check whether the megamenu panel contains a search bar or search input. Set hasSearchForm: true or false.' };
      }
      if (p3.hasSearchForm === true && (!p3.searchFormDetails || !p3.searchFormDetails.position)) {
        return { pass: false, severity: 'warn', message: '⚠️ [Nav Gate] WARNING — phase-3-megamenu.json has hasSearchForm=true but searchFormDetails is incomplete.\n\nPopulate searchFormDetails: position (where search appears in panel), scope (what it filters).' };
      }
      if (p3.hasLocaleSelector === undefined) {
        return { pass: false, message: '🚫 [Nav Gate] BLOCKED — phase-3-megamenu.json is missing the hasLocaleSelector field.\n\nWhen a megamenu exists, you MUST check whether the megamenu panel contains a locale/language/region selector. Set hasLocaleSelector: true or false.' };
      }
      if (p3.hasLocaleSelector === true && (!p3.localeSelectorDetails || !p3.localeSelectorDetails.selectorType)) {
        return { pass: false, severity: 'warn', message: '⚠️ [Nav Gate] WARNING — phase-3-megamenu.json has hasLocaleSelector=true but localeSelectorDetails is incomplete.\n\nPopulate localeSelectorDetails: selectorType (country-grid|language-list|region-tabs), hasFlags, entryCount.\nIf hasFlags is true, download all flag images to content/images/ and reference them in nav.plain.html.' };
      }
      return { pass: true };
    },
  },

  // Gate 14/14b/14c: phase-4-mobile.json — hasSearchForm, hasLocaleSelector, splitLinkPattern (mandatory per item)
  {
    id: '14',
    when: (ctx) => ctx.basename === 'phase-4-mobile.json',
    severity: 'block',
    check: (ctx) => {
      const p4 = loadJson(ctx.filePath);
      if (!p4) return { pass: true };
      if (p4.hasSearchForm === undefined) {
        return { pass: false, message: '🚫 [Nav Gate] BLOCKED — phase-4-mobile.json is missing the hasSearchForm field.\n\nYou MUST check whether the mobile header or mobile menu contains a search bar/input/form. Set hasSearchForm: true or false.' };
      }
      if (p4.hasSearchForm === true && (!p4.searchFormDetails || !p4.searchFormDetails.formType)) {
        return { pass: false, severity: 'warn', message: '⚠️ [Nav Gate] WARNING — phase-4-mobile.json has hasSearchForm=true but searchFormDetails is incomplete.\n\nPopulate searchFormDetails: formType (inline-input|expandable-icon|inside-menu|modal-overlay|hidden), visibleInClosedState, position.' };
      }
      if (p4.hasLocaleSelector === undefined) {
        return { pass: false, message: '🚫 [Nav Gate] BLOCKED — phase-4-mobile.json is missing the hasLocaleSelector field.\n\nYou MUST check whether the mobile header or mobile menu contains a locale/language selector. Set hasLocaleSelector: true or false.' };
      }
      if (p4.hasLocaleSelector === true && (!p4.localeSelectorDetails || !p4.localeSelectorDetails.selectorType)) {
        return { pass: false, severity: 'warn', message: '⚠️ [Nav Gate] WARNING — phase-4-mobile.json has hasLocaleSelector=true but localeSelectorDetails is incomplete.\n\nPopulate localeSelectorDetails: selectorType, triggerElement, visibleInClosedState, hasFlags, position, dropdownLayout.' };
      }
      // Gate 14c: every mobileMenuItems entry MUST have splitLinkPattern (text vs chevron)
      const items = Array.isArray(p4.mobileMenuItems) ? p4.mobileMenuItems : [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const sp = item && item.splitLinkPattern;
        if (!sp || typeof sp.textClickBehavior === 'undefined' || typeof sp.chevronClickBehavior === 'undefined') {
          const label = (item && item.label) ? ` "${item.label}"` : ` #${i + 1}`;
          return {
            pass: false,
            message: `🚫 [Nav Gate] BLOCKED (Gate 14c) — phase-4-mobile.json mobileMenuItems[${i}]${label} is missing splitLinkPattern.\n\nEach mobile nav item has TWO clickable areas: text (navigates) and arrow/chevron (expands). You MUST test BOTH on source and migrated and record for EVERY item: splitLinkPattern.textClickBehavior (navigate|expand|none|same-as-chevron) and splitLinkPattern.chevronClickBehavior (expand|navigate|none|no-chevron).`
          };
        }
      }
      // Gate 14d: menuItemsWidthLayout required (full-width-flush vs centered-with-margins — ensures mobile menu items match source width)
      const validWidthLayouts = ['full-width-flush', 'centered-with-margins', 'constrained-max-width', 'unknown'];
      if (p4.menuItemsWidthLayout === undefined || p4.menuItemsWidthLayout === '') {
        return { pass: false, message: '🚫 [Nav Gate] BLOCKED (Gate 14d) — phase-4-mobile.json is missing menuItemsWidthLayout.\n\nYou MUST observe on the SOURCE at mobile viewport whether menu items are full-width flush to the edges or centered with margins. Set menuItemsWidthLayout: "full-width-flush" | "centered-with-margins" | "constrained-max-width" | "unknown". This is used so migrated CSS matches (e.g. avoid desktop justify-content without a mobile override).' };
      }
      if (!validWidthLayouts.includes(p4.menuItemsWidthLayout)) {
        return { pass: false, message: `🚫 [Nav Gate] BLOCKED (Gate 14d) — phase-4-mobile.json menuItemsWidthLayout must be one of: ${validWidthLayouts.join(', ')}. Got: ${JSON.stringify(p4.menuItemsWidthLayout)}` };
      }
      ctx.log?.('INFO', `[MOBILE] phase-4 menuItemsWidthLayout validated: ${p4.menuItemsWidthLayout}`, { menuItemsWidthLayout: p4.menuItemsWidthLayout });
      return { pass: true };
    },
  },

  // Gate 7, 8, 12: mobile-style-register.json
  {
    id: '7-8-12',
    when: (ctx) => isMobileStyleRegisterFile(ctx.filePath),
    severity: 'block',
    check: (ctx) => {
      const wr = ctx.workspaceRoot;
      const mobileCritiqueErrors = checkMobileCritiqueProof(wr);
      if (mobileCritiqueErrors.length > 0) {
        const msg = `🚫 [Nav Gate] [MOBILE] mobile-style-register.json has validated components WITHOUT critique proof:\n\n` + mobileCritiqueErrors.map((e, i) => `  ${i + 1}. ${e}`).join('\n') + '\n\nRun nav-component-critique at MOBILE viewport (375×812) for each component. Screenshots + report must exist.';
        return { pass: false, message: msg };
      }
      if (!fs.existsSync(path.join(wr, MOBILE_SCHEMA_REGISTER))) {
        return { pass: false, message: '🚫 [Nav Gate] [MOBILE] mobile-style-register.json written but mobile-schema-register.json does NOT exist.\n\nMobile workflow order: Structural validation FIRST → Style validation SECOND.\nRun mobile structural comparison and write mobile-schema-register.json BEFORE building mobile style register.' };
      }
      const headingCoveragePath = path.join(wr, MOBILE_DIR, 'mobile-heading-coverage.json');
      if (!fs.existsSync(headingCoveragePath)) {
        return { pass: false, message: '🚫 [Nav Gate] [MOBILE] mobile-style-register.json written but mobile-heading-coverage.json does NOT exist.\n\nBefore building the mobile style register, you MUST click EVERY mobile nav heading and write the heading coverage file.' };
      }
      const headingCov = loadJson(headingCoveragePath);
      if (headingCov && !headingCov.allCovered) {
        return { pass: false, message: '🚫 [Nav Gate] [MOBILE] mobile-heading-coverage.json has allCovered=false.\n\nNot all mobile nav headings were tested. Go back and click EVERY heading before proceeding to style register.' };
      }
      const dimGateResult = checkMobileDimensionalGate(wr);
      if (dimGateResult.errors.length > 0) {
        const msg = `🚫 [Nav Gate] [MOBILE] mobile-style-register.json is BLOCKED until mobile-dimensional-gate passes.\n\n${dimGateResult.errors.join('\n\n')}\n\nRun: node scripts/mobile-dimensional-gate.js --url=<migrated-url> --validation-dir=blocks/header/navigation-validation (viewport 375×812). Fix any failed checks (e.g. .nav-list and .nav-item width: 100%) and re-run until exit 0.`;
        return { pass: false, message: msg };
      }
      return { pass: true };
    },
  },

  // Gate 9: header.js hardcoded content
  {
    id: '9',
    when: (ctx) => ctx.basename === 'header.js',
    severity: 'warn',
    check: (ctx) => {
      try {
        const jsContent = fs.readFileSync(ctx.filePath, 'utf8');
        const warnings = [];
        const innerHTMLMatches = (jsContent.match(/\.innerHTML\s*=\s*`[^`]{80,}/g) || []);
        if (innerHTMLMatches.length > 0) warnings.push(`Found ${innerHTMLMatches.length} large innerHTML template literal(s) — megamenu content should come from nav DOM, not JS template strings.`);
        const createElWithText = (jsContent.match(/createElement\([^)]+\)[\s\S]{0,30}\.textContent\s*=\s*['"][^'"]{20,}['"]/g) || []);
        if (createElWithText.length > 2) warnings.push(`Found ${createElWithText.length} createElement + long textContent assignments — content text should live in nav file, not be generated in JS.`);
        const hardcodedLinks = (jsContent.match(/href\s*[:=]\s*['"][^'"]*https?:\/\/[^'"]+['"]/g) || []);
        if (hardcodedLinks.length > 3) warnings.push(`Found ${hardcodedLinks.length} hardcoded href URLs — link destinations should be in nav content, not in header.js.`);
        const countryArrayLike = (jsContent.match(/\[\s*['"](?:Germany|France|Spain|Italy|United Kingdom|Austria|Belgium|Netherlands|Algeria|Brazil|EU|Türkiye|Switzerland)[^\]]{0,200}\]/gi) || []);
        const flagUrlInJs = (jsContent.match(/['"`][^'"`]*(?:flag-[a-z]{2}|flag_|images\/flag)[^'"`]*\.(?:svg|png|webp)['"`]/gi) || []);
        if (countryArrayLike.length > 0) warnings.push(`Found ${countryArrayLike.length} array(s) that look like hardcoded country names — country names MUST be in nav file.`);
        if (flagUrlInJs.length > 2) warnings.push(`Found ${flagUrlInJs.length} hardcoded flag image path(s) in JS — flag images MUST be referenced in nav file.`);
        const siteSpecificFns = (jsContent.match(/function\s+(build|create|render|setup|init)[A-Z][a-zA-Z]*(Megamenu|Panel|Menu|Nav|Accordion|Drawer|Dropdown|SubPanel)\b/g) || []);
        if (siteSpecificFns.length > 0) warnings.push(`Found ${siteSpecificFns.length} site-specific function name(s): ${siteSpecificFns.join(', ')}. Functions must be GENERIC and reusable — do not name them after source site categories.`);
        if (warnings.length > 0) {
          const msg = `⚠️ [Nav Gate] WARNING — header.js may contain hardcoded content:\n\n` + warnings.map((w, i) => `${i + 1}. ${w}`).join('\n') + '\n\nContent-first rule: ALL text, links, category names, sub-menu items, country names, and flag image references belong in content/nav.plain.html. header.js must only READ the nav DOM and implement behavior.';
          return { pass: false, message: msg };
        }
        return { pass: true };
      } catch (e) {
        return { pass: true };
      }
    },
  },

  // Gate 15: header.js viewport resize (after mobile phase)
  {
    id: '15',
    when: (ctx) => ctx.basename === 'header.js' && fs.existsSync(path.join(ctx.workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json')),
    severity: 'warn',
    check: (ctx) => {
      try {
        const jsContent = fs.readFileSync(ctx.filePath, 'utf8');
        const hasResizeListener = /addEventListener\s*\(\s*['"]resize['"]/i.test(jsContent);
        const hasMatchMedia = /matchMedia\s*\(/i.test(jsContent);
        const hasResizeObserver = /ResizeObserver/i.test(jsContent);
        const hasOnResize = /window\.onresize/i.test(jsContent);
        if (hasResizeListener || hasMatchMedia || hasResizeObserver || hasOnResize) return { pass: true };
        const msg = `⚠️ [Nav Gate] WARNING — header.js has NO viewport resize / matchMedia handling.\n\nWhen the browser is resized between desktop and mobile breakpoints, the header layout may break.\nAdd window.matchMedia(breakpoint).addEventListener("change", handler) or window.addEventListener("resize", debounceHandler).`;
        return { pass: false, message: msg };
      } catch (e) {
        return { pass: true };
      }
    },
  },

  // Gate 13: header.css mobile pattern consistency
  {
    id: '13',
    when: (ctx) => ctx.basename === 'header.css',
    severity: 'warn',
    check: (ctx) => {
      const p4 = loadJson(path.join(ctx.workspaceRoot, VALIDATION_DIR, 'phase-4-mobile.json'));
      if (!p4?.openBehavior) return { pass: true };
      try {
        const cssContent = fs.readFileSync(ctx.filePath, 'utf8');
        if (p4.openBehavior === 'slide-in-panel') {
          if (!/translateX/i.test(cssContent)) {
            return { pass: false, message: '⚠️ [Nav Gate] [MOBILE] WARNING — phase-4-mobile.json declares openBehavior="slide-in-panel" but header.css has NO translateX() rules.\n\nSlide-in panels require CSS transform: translateX() for the sliding transition. Do NOT use accordion expand-in-place when source uses slide-in-panel.' };
          }
        }
        if (p4.openBehavior === 'accordion') {
          const hasAccordionPatterns = /max-height|collapse|expand|accordion/i.test(cssContent);
          if (!hasAccordionPatterns) {
            return { pass: false, message: '⚠️ [Nav Gate] [MOBILE] WARNING — phase-4-mobile.json declares openBehavior="accordion" but header.css has no accordion CSS patterns (max-height, collapse, expand).' };
          }
        }
        const animErrors = checkMobileAnimationSpeed(ctx.workspaceRoot);
        if (animErrors.length > 0) {
          return { pass: false, message: `⚠️ [Nav Gate] [MOBILE] WARNING — Animation speed mismatches:\n\n` + animErrors.map((e, i) => `${i + 1}. ${e}`).join('\n') + '\n\nMatch the source animation speeds exactly.' };
        }
        return { pass: true };
      } catch (e) {
        return { pass: true };
      }
    },
  },
];
