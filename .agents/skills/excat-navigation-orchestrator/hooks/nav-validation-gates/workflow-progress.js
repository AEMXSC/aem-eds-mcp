/**
 * Workflow progress dashboard for nav-validation-gate.
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
  MOBILE_STYLE_REGISTER,
  MOBILE_SCHEMA_REGISTER,
  MOBILE_BEHAVIOR_REGISTER,
  MOBILE_DIR,
  loadJson,
  hasRowElements,
  hasMegamenu,
  detectPhase,
  getNavFilePath,
} from './helpers.js';

const AGGREGATE = path.join(VALIDATION_DIR, 'phase-5-aggregate.json');

export function logWorkflowProgress(workspaceRoot, log) {
  const vdir = path.join(workspaceRoot, VALIDATION_DIR);
  if (!fs.existsSync(vdir)) return;

  const check = (rel) => fs.existsSync(path.join(workspaceRoot, rel));
  const loadAndSummarize = (rel) => loadJson(path.join(workspaceRoot, rel));

  const phase = detectPhase(workspaceRoot);

  const desktopMilestones = {
    'session.json': check(path.join(VALIDATION_DIR, 'session.json')),
    'phase-1-row-detection.json': check(path.join(VALIDATION_DIR, 'phase-1-row-detection.json')),
    'phase-2-row-mapping.json': check(path.join(VALIDATION_DIR, 'phase-2-row-mapping.json')),
    'header-appearance-mapping.json': check(path.join(VALIDATION_DIR, 'header-appearance-mapping.json')),
    'phase-3-megamenu.json': check(path.join(VALIDATION_DIR, 'phase-3-megamenu.json')),
    'megamenu-mapping.json': check(path.join(VALIDATION_DIR, 'megamenu-mapping.json')),
    'phase-5-aggregate.json': check(AGGREGATE),
    'content/nav.plain.html': !!getNavFilePath(workspaceRoot),
    'header.css': check('blocks/header/header.css'),
    'header.js': check('blocks/header/header.js'),
    'row-elements-mapping.json': check(path.join(VALIDATION_DIR, 'row-elements-mapping.json')),
    'migrated-row-elements-mapping.json': check(path.join(VALIDATION_DIR, 'migrated-row-elements-mapping.json')),
    'row-elements-behavior-register.json': check(path.join(VALIDATION_DIR, 'row-elements-behavior-register.json')),
    'migrated-megamenu-mapping.json': check(path.join(VALIDATION_DIR, 'migrated-megamenu-mapping.json')),
    'migrated-structural-summary.json': check(path.join(VALIDATION_DIR, 'migrated-structural-summary.json')),
  };

  const mobileMilestones = {
    'phase-4-mobile.json': check(path.join(VALIDATION_DIR, 'phase-4-mobile.json')),
    'mobile/migrated-mobile-structural-summary.json': check(path.join(MOBILE_DIR, 'migrated-mobile-structural-summary.json')),
    'mobile/mobile-schema-register.json': check(path.join(MOBILE_DIR, 'mobile-schema-register.json')),
    'mobile/mobile-heading-coverage.json': check(path.join(MOBILE_DIR, 'mobile-heading-coverage.json')),
    'mobile/mobile-behavior-register.json': check(path.join(MOBILE_DIR, 'mobile-behavior-register.json')),
    'mobile/mobile-style-register.json': check(path.join(MOBILE_DIR, 'mobile-style-register.json')),
  };

  const scriptEvidence = {
    'detect-header-rows.js RAN': check(path.join(VALIDATION_DIR, ROW_DETECTION_MARKER)),
    'validate-nav-content.js RAN': check(path.join(VALIDATION_DIR, '.nav-content-validated')),
    'compare-megamenu-behavior.js RAN': check(MEGAMENU_BEHAVIOR_REGISTER),
    'compare-row-elements-behavior.js RAN': check(ROW_ELEMENTS_BEHAVIOR_REGISTER),
    'compare-structural-schema.js RAN': check(SCHEMA_REGISTER),
    'compare-header-appearance.js RAN': check(path.join(VALIDATION_DIR, 'header-appearance-register.json')),
  };

  const registers = {};
  const styleReg = loadAndSummarize(STYLE_REGISTER);
  if (styleReg) {
    const comps = styleReg.components || [];
    const validated = comps.filter(c => c.status === 'validated').length;
    const pending = comps.filter(c => c.status === 'pending').length;
    const skipped = comps.filter(c => c.status === 'skipped').length;
    const avgSim = comps.length > 0 ? Math.round(comps.reduce((s, c) => s + (c.lastSimilarity || 0), 0) / comps.length) : 0;
    const parts = [`${validated}/${comps.length} validated`];
    if (pending > 0) parts.push(`${pending} pending`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    registers['style-register'] = parts.join(', ') + `, avg similarity=${avgSim}%`;
  } else {
    registers['style-register'] = 'NOT CREATED';
  }

  const schemaReg = loadAndSummarize(SCHEMA_REGISTER);
  if (schemaReg) {
    const items = schemaReg.items || [];
    const validated = items.filter(i => i.status === 'validated').length;
    registers['schema-register'] = `${validated}/${items.length} validated, allValidated=${schemaReg.allValidated}`;
  } else {
    registers['schema-register'] = 'NOT CREATED';
  }

  const behaviorReg = loadAndSummarize(MEGAMENU_BEHAVIOR_REGISTER);
  if (behaviorReg) {
    const items = behaviorReg.items || [];
    const passed = items.filter(i => i.status === 'validated' || i.status === 'passed').length;
    registers['megamenu-behavior-register'] = `${passed}/${items.length} passed, allValidated=${behaviorReg.allValidated}`;
  } else {
    registers['megamenu-behavior-register'] = hasMegamenu(workspaceRoot) ? 'NOT CREATED (megamenu exists!)' : 'N/A (no megamenu)';
  }

  const rowBehaviorReg = loadAndSummarize(ROW_ELEMENTS_BEHAVIOR_REGISTER);
  if (rowBehaviorReg) {
    const items = rowBehaviorReg.items || [];
    const passed = items.filter(i => i.status === 'validated').length;
    registers['row-elements-behavior-register'] = `${passed}/${items.length} passed, allValidated=${rowBehaviorReg.allValidated}`;
  } else {
    registers['row-elements-behavior-register'] = hasRowElements(workspaceRoot) ? 'NOT CREATED (phase-2 has rows!)' : 'N/A (no rows)';
  }

  const headerAppearanceSourceExists = fs.existsSync(path.join(workspaceRoot, VALIDATION_DIR, 'header-appearance-mapping.json'));
  const headerAppReg = loadAndSummarize(path.join(VALIDATION_DIR, 'header-appearance-register.json'));
  if (headerAppearanceSourceExists) {
    registers['header-appearance-register'] = headerAppReg && headerAppReg.allValidated ? 'allValidated=true' : 'NOT CREATED or allValidated=false';
  } else {
    registers['header-appearance-register'] = 'N/A (no header-appearance-mapping)';
  }

  const mobileSchemaReg = loadAndSummarize(MOBILE_SCHEMA_REGISTER);
  if (mobileSchemaReg) {
    const items = mobileSchemaReg.items || [];
    const validated = items.filter(i => i.status === 'validated').length;
    registers['mobile-schema-register'] = `${validated}/${items.length} validated, allValidated=${mobileSchemaReg.allValidated}`;
  } else {
    registers['mobile-schema-register'] = check(path.join(VALIDATION_DIR, 'phase-4-mobile.json')) ? 'NOT CREATED (phase-4 exists!)' : 'N/A (mobile not started)';
  }

  const mobileBehaviorReg = loadAndSummarize(MOBILE_BEHAVIOR_REGISTER);
  if (mobileBehaviorReg) {
    const items = mobileBehaviorReg.items || [];
    const passed = items.filter(i => i.status === 'validated' || i.status === 'passed').length;
    registers['mobile-behavior-register'] = `${passed}/${items.length} passed, allValidated=${mobileBehaviorReg.allValidated}`;
  } else {
    registers['mobile-behavior-register'] = check(path.join(VALIDATION_DIR, 'phase-4-mobile.json')) ? 'NOT CREATED (phase-4 exists!)' : 'N/A (mobile not started)';
  }

  const mobileStyleReg = loadAndSummarize(MOBILE_STYLE_REGISTER);
  if (mobileStyleReg) {
    const comps = mobileStyleReg.components || [];
    const validated = comps.filter(c => c.status === 'validated').length;
    const pending = comps.filter(c => c.status === 'pending').length;
    const skipped = comps.filter(c => c.status === 'skipped').length;
    const avgSim = comps.length > 0 ? Math.round(comps.reduce((s, c) => s + (c.lastSimilarity || 0), 0) / comps.length) : 0;
    const parts = [`${validated}/${comps.length} validated`];
    if (pending > 0) parts.push(`${pending} pending`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    registers['mobile-style-register'] = parts.join(', ') + `, avg similarity=${avgSim}%`;
  } else {
    registers['mobile-style-register'] = check(path.join(VALIDATION_DIR, 'phase-4-mobile.json')) ? 'NOT CREATED (phase-4 exists!)' : 'N/A (mobile not started)';
  }

  const countCritiqueReports = (dir) => {
    let count = 0;
    if (fs.existsSync(dir)) {
      try {
        const subdirs = fs.readdirSync(dir, { withFileTypes: true });
        for (const d of subdirs) {
          if (d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'critique-report.json'))) count++;
        }
      } catch (_) { /* ignore */ }
    }
    return count;
  };

  const desktopCritiqueCount = countCritiqueReports(path.join(vdir, 'critique'));
  const mobileCritiqueCount = countCritiqueReports(path.join(vdir, 'mobile', 'critique'));

  const phase4ForDashboard = loadAndSummarize(path.join(VALIDATION_DIR, 'phase-4-mobile.json'));
  const menuItemsWidthLayoutLine = phase4ForDashboard?.menuItemsWidthLayout != null
    ? `│   menuItemsWidthLayout: ${phase4ForDashboard.menuItemsWidthLayout}`
    : null;

  const progressLines = [
    `┌─── WORKFLOW PROGRESS DASHBOARD ─── [Phase: ${phase}] ───┐`,
    '│',
    '│ ═══ DESKTOP ═══',
    '│ Milestones:',
    ...Object.entries(desktopMilestones).map(([k, v]) => `│   ${v ? '✅' : '❌'} ${k}`),
    '│ Scripts executed (evidence):',
    ...Object.entries(scriptEvidence).map(([k, v]) => `│   ${v ? '✅' : '❌'} ${k}`),
    '│ Desktop Registers:',
    ...Object.entries(registers).filter(([k]) => !k.startsWith('mobile')).map(([k, v]) => `│   📊 ${k}: ${v}`),
    `│ Desktop critique reports: ${desktopCritiqueCount}`,
    '│',
    '│ ═══ MOBILE ═══',
    '│ Milestones:',
    ...Object.entries(mobileMilestones).map(([k, v]) => `│   ${v ? '✅' : '❌'} ${k}`),
    ...(menuItemsWidthLayoutLine ? [menuItemsWidthLayoutLine] : []),
    '│ Mobile Registers:',
    ...Object.entries(registers).filter(([k]) => k.startsWith('mobile')).map(([k, v]) => `│   📊 ${k}: ${v}`),
    `│ Mobile critique reports: ${mobileCritiqueCount}`,
    '│',
    '└──────────────────────────────────────────────────────────┘'
  ];

  log('INFO', 'WORKFLOW PROGRESS:\n' + progressLines.join('\n'));
}
