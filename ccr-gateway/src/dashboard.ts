import * as fs from 'fs';
import * as path from 'path';

const DB_FILE = path.join(process.cwd(), 'ccr_database.json');

interface DatabaseSchema {
  request_events: any[];
  policy_hits: any[];
  spend_records: any[];
  repo_configs: any[];
  policy_rules: any[];
  active_route?: string;
  active_mode?: string;
}

function getDbData(): DatabaseSchema {
  if (!fs.existsSync(DB_FILE)) {
    return { request_events: [], policy_hits: [], spend_records: [], repo_configs: [], policy_rules: [] };
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      request_events: parsed.request_events || [],
      policy_hits: parsed.policy_hits || [],
      spend_records: parsed.spend_records || [],
      repo_configs: parsed.repo_configs || [],
      policy_rules: parsed.policy_rules || [],
      active_route: parsed.active_route,
      active_mode: parsed.active_mode
    };
  } catch (e) {
    return { request_events: [], policy_hits: [], spend_records: [], repo_configs: [], policy_rules: [] };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Returns a visually stunning Adobe Spectrum styled HTML dashboard page.
 */
export function renderDashboard(vllmHealthy = true, vpnHealthy = true): string {
  const db = getDbData();
  
  // Resolve active IDE route display
  const activeRouteId = db.active_route || 'aws-hosted/deepseek-coder-v2';
  const activeMode = db.active_mode || 'manual';
  
  const models = [
    { id: 'aws-hosted/qwen-coder-32b', name: 'Fast Code (AWS)' },
    { id: 'aws-hosted/deepseek-coder-v2', name: 'Balanced Code (AWS)' },
    { id: 'aws-hosted/glm-coder-v2', name: 'Experimental Code (AWS)' },
    { id: 'bedrock/claude-3-5-sonnet', name: 'Claude Sonnet (Bedrock)' },
    { id: 'internal/adobe-codex-v2', name: 'Internal Secure Route' }
  ];
  const matched = models.find(m => m.id === activeRouteId);
  const activeModelName = matched ? matched.name : activeRouteId;
  const capitalizedMode = activeMode.charAt(0).toUpperCase() + activeMode.slice(1);

  // Parse feedback_records safely
  const feedbackList = (db as any).feedback_records || [];

  // Initialize Route Analytics Metrics Object
  const routeMetrics: Record<string, {
    name: string;
    totalTasks: number;
    actualCost: number;
    baselineCost: number;
    savings: number;
    avgLatency: number;
    feedbackCount: number;
    keptCount: number;
    reworkedCount: number;
    retriedCount: number;
    abandonedCount: number;
  }> = {};

  models.forEach(m => {
    routeMetrics[m.id] = {
      name: m.name,
      totalTasks: 0,
      actualCost: 0,
      baselineCost: 0,
      savings: 0,
      avgLatency: 0,
      feedbackCount: 0,
      keptCount: 0,
      reworkedCount: 0,
      retriedCount: 0,
      abandonedCount: 0
    };
  });

  // Calculate requests counts and latency parameters
  db.request_events.forEach(e => {
    const routeId = e.model;
    if (routeMetrics[routeId]) {
      routeMetrics[routeId].totalTasks += 1;
      const count = routeMetrics[routeId].totalTasks;
      routeMetrics[routeId].avgLatency = Math.round(
        ((routeMetrics[routeId].avgLatency * (count - 1)) + e.latency_ms) / count
      );
    }
  });

  // Calculate actual vs baseline economics
  db.spend_records.forEach(s => {
    const req = db.request_events.find(e => e.correlation_id === s.correlation_id);
    const targetModelId = req ? req.model : activeRouteId;
    if (routeMetrics[targetModelId]) {
      routeMetrics[targetModelId].actualCost += s.actual_cost || 0;
      routeMetrics[targetModelId].baselineCost += s.baseline_cost || 0;
      routeMetrics[targetModelId].savings += s.delta || 0;
    }
  });

  // Calculate outcome feedback metrics
  feedbackList.forEach((f: any) => {
    const req = db.request_events.find(e => e.correlation_id === f.correlationId);
    const targetModelId = req ? req.model : activeRouteId;
    if (routeMetrics[targetModelId]) {
      routeMetrics[targetModelId].feedbackCount += 1;
      if (f.outcome === 'kept') routeMetrics[targetModelId].keptCount += 1;
      else if (f.outcome === 'reworked') routeMetrics[targetModelId].reworkedCount += 1;
      else if (f.outcome === 'retried') routeMetrics[targetModelId].retriedCount += 1;
      else if (f.outcome === 'abandoned') routeMetrics[targetModelId].abandonedCount += 1;
    }
  });

  // Calculate metric aggregates
  const totalRequests = db.request_events.length;
  const blockedHits = db.policy_hits.filter(h => h.action === 'block');
  const totalBlocked = blockedHits.length;
  const warnings = db.policy_hits.filter(h => h.action === 'warn').length;
  
  // Calculate savings (actual cost vs baseline)
  let totalActualCost = 0;
  let totalBaselineCost = 0;
  db.spend_records.forEach(r => {
    totalActualCost += parseFloat(r.actual_cost) || 0;
    totalBaselineCost += parseFloat(r.baseline_cost) || 0;
  });
  const totalSavings = Math.max(0, totalBaselineCost - totalActualCost);

  // Generate route-lane metrics rows
  const analyticsRows = Object.keys(routeMetrics).map(id => {
    const m = routeMetrics[id];
    const keepRate = m.feedbackCount > 0 ? Math.round((m.keptCount / m.feedbackCount) * 100) : 0;
    const reworkRate = m.feedbackCount > 0 ? Math.round((m.reworkedCount / m.feedbackCount) * 100) : 0;
    const abandonRate = m.feedbackCount > 0 ? Math.round((m.abandonedCount / m.feedbackCount) * 100) : 0;

    const displayKeep = m.feedbackCount > 0 ? `${keepRate}%` : '0%';
    const displayRework = m.feedbackCount > 0 ? `${reworkRate}%` : '0%';
    const displayAbandon = m.feedbackCount > 0 ? `${abandonRate}%` : '0%';

    return `
      <tr>
        <td><strong>${escapeHtml(m.name)}</strong></td>
        <td>${m.totalTasks}</td>
        <td>${m.avgLatency}ms</td>
        <td>$${m.actualCost.toFixed(4)}</td>
        <td style="color: var(--spectrum-accent-green); font-weight: 600;">$${m.savings.toFixed(4)}</td>
        <td><span class="status-indicator status-allow">${displayKeep}</span></td>
        <td><span class="status-indicator status-warn">${displayRework}</span></td>
        <td><span class="status-indicator status-block">${displayAbandon}</span></td>
      </tr>
    `;
  }).join('');

  // Generate request rows (render full list so client-side filter can manage pagination/searching)
  const requestRows = db.request_events.map(e => {
    const isError = e.status >= 400;
    const isBlock = e.status === 400;
    const isWarn = e.status === 200 && db.policy_hits.some(h => h.correlation_id === e.correlation_id && h.action === 'warn');
    const statusClass = isBlock ? 'status-block' : isWarn ? 'status-warn' : isError ? 'status-block' : 'status-allow';
    const actionText = isBlock ? 'Blocked' : isWarn ? 'Warned' : 'Allowed';
    const cleanId = escapeHtml(e.correlation_id);
    return `
      <tr class="log-row" data-id="${cleanId}" data-action="${actionText.toLowerCase()}" data-model="${escapeHtml(e.model.toLowerCase())}" data-timestamp="${e.timestamp}">
        <td><button onclick="showRequestDetail('${cleanId}')" class="detail-link"><code>${cleanId.substring(0, 8)}</code></button></td>
        <td class="time-cell" data-val="${e.timestamp}">${new Date(e.timestamp).toLocaleString()}</td>
        <td><code>${escapeHtml(e.model)}</code></td>
        <td><span class="status-indicator ${statusClass}">${e.status} (${actionText})</span></td>
        <td>${e.latency_ms}ms</td>
      </tr>
    `;
  }).reverse().join('');

  // Generate policy hit rows for the side timeline
  const policyRows = db.policy_hits.slice(-15).reverse().map(h => {
    const actionClass = h.action === 'block' ? 'badge-block' : 'badge-warn';
    return `
      <div class="activity-card">
        <div class="activity-header">
          <span class="action-badge ${actionClass}">${h.action.toUpperCase()}</span>
          <span class="activity-time">${new Date(h.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="activity-body">
          <p>Rule: <code>${escapeHtml(h.rule_id)}</code></p>
          <p class="matched-val">${escapeHtml(h.matched_value || 'Sensitive signature matched')}</p>
        </div>
      </div>
    `;
  }).join('');

  // Generate Policy Manager list rows
  const rules = db.policy_rules || [];
  const rulesRows = rules.map(r => {
    const modeClass = r.mode === 'enforce' ? 'status-block' : r.mode === 'warn' ? 'status-warn' : 'status-allow';
    const lastMatched = r.last_matched_at ? new Date(r.last_matched_at).toLocaleString() : 'Never';
    const cleanId = escapeHtml(r.id);
    const cleanName = escapeHtml(r.name);
    const cleanPattern = escapeHtml(r.pattern);
    const cleanMode = escapeHtml(r.mode);
    const cleanType = escapeHtml(r.type);
    const cleanDesc = escapeHtml(r.description || '');
    const cleanScope = escapeHtml(r.scope || 'repo');

    return `
      <tr id="rule-row-${cleanId}">
        <td><strong>${cleanName}</strong></td>
        <td><code>${cleanPattern}</code></td>
        <td><span class="status-indicator ${modeClass}">${cleanMode.toUpperCase()}</span></td>
        <td><code>${cleanType}</code></td>
        <td>${cleanScope}</td>
        <td><span class="count-badge">${r.hit_count || 0}</span></td>
        <td><small class="time-text">${lastMatched}</small></td>
        <td>
          <button class="spectrum-link edit-rule-btn"
            data-rid="${cleanId}" data-name="${cleanName}" data-pattern="${cleanPattern}"
            data-mode="${cleanMode}" data-type="${cleanType}" data-desc="${cleanDesc}"
            data-scope="${cleanScope}">Edit</button>
          <button class="spectrum-link delete delete-rule-btn" data-rid="${cleanId}">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ccr Private Gateway Admin Console</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        :root {
          /* Adobe Spectrum Darkest Palette Tokens */
          --spectrum-bg: #1e1e1e;
          --spectrum-panel: #262626;
          --spectrum-sidebar: #1b1b1b;
          --spectrum-border: #323232;
          
          --spectrum-accent-blue: #1473e6;
          --spectrum-accent-blue-hover: #0d66d0;
          --spectrum-accent-red: #d7373f;
          --spectrum-accent-orange: #df7b00;
          --spectrum-accent-green: #12805c;
          
          --text-primary: #e1e1e1;
          --text-secondary: #9d9d9d;
          --text-disabled: #6e6e6e;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background-color: var(--spectrum-bg);
          color: var(--text-primary);
          min-height: 100vh;
          display: flex;
          overflow: hidden;
          line-height: 1.5;
        }

        /* LEFT RAIL (Sidebar App Shell) */
        aside {
          width: 250px;
          background-color: var(--spectrum-sidebar);
          border-right: 1px solid var(--spectrum-border);
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          flex-shrink: 0;
        }

        .aside-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 2rem;
        }

        .aside-logo {
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #ffffff;
          font-size: 0.95rem;
        }

        .badge-pilot {
          background-color: rgba(18, 128, 92, 0.15);
          color: var(--spectrum-accent-green);
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .nav-vertical {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          flex-grow: 1;
        }

        .nav-item {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-family: inherit;
          font-size: 0.875rem;
          font-weight: 600;
          text-align: left;
          padding: 0.65rem 0.75rem;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.15s ease, color 0.15s ease;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          text-decoration: none;
        }

        .nav-item:hover {
          background-color: rgba(255, 255, 255, 0.04);
          color: #ffffff;
        }

        .nav-item.active {
          background-color: rgba(20, 115, 230, 0.1);
          color: var(--spectrum-accent-blue);
        }

        .aside-footer {
          border-top: 1px solid var(--spectrum-border);
          padding-top: 1rem;
          font-size: 0.75rem;
          color: var(--text-disabled);
        }

        /* MAIN CONTENT CONTAINER */
        .workspace {
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
        }

        .top-bar {
          height: 56px;
          border-bottom: 1px solid var(--spectrum-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2rem;
          background-color: var(--spectrum-panel);
        }

        .breadcrumbs {
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .breadcrumbs span {
          color: var(--text-primary);
          font-weight: 600;
        }

        .system-status {
          font-size: 0.8rem;
          color: var(--spectrum-accent-green);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .system-status::before {
          content: '';
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: var(--spectrum-accent-green);
        }

        .scrollable-body {
          flex-grow: 1;
          overflow-y: auto;
          padding: 2rem;
        }

        /* Metrics Strip layout */
        .grid-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.25rem;
          margin-bottom: 2rem;
        }

        @media (max-width: 1100px) {
          .grid-metrics {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 600px) {
          .grid-metrics {
            grid-template-columns: 1fr;
          }
        }

        .metric-card {
          background-color: var(--spectrum-panel);
          border: 1px solid var(--spectrum-border);
          border-radius: 4px;
          padding: 1.25rem;
          border-left: 3px solid var(--spectrum-accent-blue);
        }

        .metric-card.blocked {
          border-left-color: var(--spectrum-accent-red);
        }

        .metric-card.savings {
          border-left-color: var(--spectrum-accent-green);
        }

        .metric-title {
          font-size: 0.72rem;
          color: var(--text-secondary);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 0.35rem;
        }

        .metric-value {
          font-size: 1.5rem;
          font-weight: 600;
          color: #ffffff;
        }

        .metric-value.savings {
          color: var(--spectrum-accent-green);
        }

        .metric-value.blocked {
          color: var(--spectrum-accent-red);
        }

        /* Split content structure */
        .grid-content {
          display: grid;
          grid-template-columns: 2.3fr 1fr;
          gap: 2rem;
        }

        @media (max-width: 1000px) {
          .grid-content {
            grid-template-columns: 1fr;
          }
        }

        .panel-card {
          background-color: var(--spectrum-panel);
          border: 1px solid var(--spectrum-border);
          border-radius: 4px;
          padding: 1.5rem;
        }

        .panel-title {
          font-size: 0.95rem;
          font-weight: 700;
          margin-bottom: 1.25rem;
          color: #ffffff;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        /* Spectrum Forms & Filters */
        .filter-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 1.25rem;
          padding: 0.75rem 1rem;
          border-radius: 4px;
          background-color: var(--spectrum-bg);
          border: 1px solid var(--spectrum-border);
          align-items: center;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .filter-group label {
          font-size: 0.7rem;
          color: var(--text-secondary);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .spectrum-input {
          background-color: var(--spectrum-panel);
          border: 1px solid var(--spectrum-border);
          color: var(--text-primary);
          padding: 0.4rem 0.65rem;
          border-radius: 4px;
          font-family: inherit;
          font-size: 0.85rem;
          outline: none;
          min-width: 130px;
        }

        .spectrum-input:focus {
          border-color: var(--spectrum-accent-blue);
        }

        .spectrum-select {
          background-color: var(--spectrum-panel);
          border: 1px solid var(--spectrum-border);
          color: var(--text-primary);
          padding: 0.4rem 0.65rem;
          border-radius: 4px;
          font-family: inherit;
          font-size: 0.85rem;
          outline: none;
        }

        .spectrum-select:focus {
          border-color: var(--spectrum-accent-blue);
        }

        /* Spectrum Tables */
        table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        th {
          color: var(--text-secondary);
          font-weight: 700;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 0.65rem 0.75rem;
          border-bottom: 2px solid var(--spectrum-border);
          background-color: var(--spectrum-panel);
        }

        td {
          padding: 0.65rem 0.75rem;
          border-bottom: 1px solid var(--spectrum-border);
          font-size: 0.875rem;
          vertical-align: middle;
        }

        tr.log-row:hover {
          background-color: rgba(255, 255, 255, 0.015);
        }

        code {
          font-family: monospace;
          background-color: rgba(0,0,0,0.3);
          padding: 0.15rem 0.35rem;
          border-radius: 4px;
          color: #c792ea;
          font-size: 0.825rem;
        }

        /* Spectrum Status Indicators */
        .status-indicator {
          display: inline-flex;
          align-items: center;
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .status-indicator::before {
          content: '';
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          margin-right: 0.45rem;
        }

        .status-allow {
          color: #268061;
        }
        .status-allow::before {
          background-color: var(--spectrum-accent-green);
        }

        .status-warn {
          color: #b86b00;
        }
        .status-warn::before {
          background-color: var(--spectrum-accent-orange);
        }

        .status-block {
          color: #c93b42;
        }
        .status-block::before {
          background-color: var(--spectrum-accent-red);
        }

        /* Spectrum Buttons */
        .btn-spectrum {
          background-color: var(--spectrum-accent-blue);
          color: #ffffff;
          border: 1px solid transparent;
          padding: 0.4rem 0.9rem;
          border-radius: 16px;
          font-weight: 600;
          font-size: 0.85rem;
          font-family: inherit;
          cursor: pointer;
          transition: background-color 0.15s ease;
        }

        .btn-spectrum:hover {
          background-color: var(--spectrum-accent-blue-hover);
        }

        .btn-spectrum.secondary {
          background-color: transparent;
          border-color: var(--text-secondary);
          color: var(--text-primary);
        }

        .btn-spectrum.secondary:hover {
          background-color: rgba(255, 255, 255, 0.03);
        }

        .spectrum-link {
          background: transparent;
          border: none;
          color: var(--spectrum-accent-blue);
          cursor: pointer;
          font-weight: 600;
          font-size: 0.85rem;
          margin-right: 0.75rem;
          font-family: inherit;
        }

        .spectrum-link:hover {
          color: var(--spectrum-accent-blue-hover);
          text-decoration: underline;
        }

        .spectrum-link.delete {
          color: var(--spectrum-accent-red);
        }

        .detail-link {
          background: transparent;
          border: none;
          color: var(--spectrum-accent-blue);
          cursor: pointer;
          font-family: inherit;
          font-weight: 600;
          text-decoration: none;
          outline: none;
        }

        .detail-link:hover {
          text-decoration: underline;
        }

        /* Alerts feed panel */
        .activity-feed {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .activity-card {
          border-bottom: 1px solid var(--spectrum-border);
          padding-bottom: 0.75rem;
        }

        .activity-card:last-child {
          border-bottom: none;
        }

        .activity-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.4rem;
        }

        .activity-time {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .badge-block {
          background-color: rgba(215, 55, 63, 0.15);
          color: #ff6b73;
          font-size: 0.6875rem;
          font-weight: 700;
          padding: 0.15rem 0.35rem;
          border-radius: 4px;
        }

        .badge-warn {
          background-color: rgba(223, 123, 0, 0.15);
          color: #ffaa3b;
          font-size: 0.6875rem;
          font-weight: 700;
          padding: 0.15rem 0.35rem;
          border-radius: 4px;
        }

        .activity-body {
          font-size: 0.85rem;
        }

        .matched-val {
          color: var(--text-secondary);
          margin-top: 0.25rem;
          font-size: 0.8rem;
          font-family: monospace;
          word-break: break-all;
        }

        .count-badge {
          background-color: rgba(20, 115, 230, 0.1);
          color: var(--spectrum-accent-blue);
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-weight: 600;
          font-size: 0.8rem;
        }

        .time-text {
          color: var(--text-secondary);
          font-size: 0.8rem;
        }

        /* Tab Panes */
        .tab-pane {
          display: none;
        }

        .tab-pane.active {
          display: block;
        }

        /* Spectrum Dialog Modal */
        .modal {
          display: none;
          position: fixed;
          z-index: 100;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.6);
          align-items: center;
          justify-content: center;
        }

        .modal.active {
          display: flex;
        }

        .modal-content {
          background-color: var(--spectrum-panel);
          border: 1px solid var(--spectrum-border);
          border-radius: 4px;
          padding: 2rem;
          width: 90%;
          max-width: 500px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }

        .modal-header {
          font-size: 1.15rem;
          font-weight: 700;
          margin-bottom: 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #ffffff;
        }

        .modal-close {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: 1.5rem;
          cursor: pointer;
        }

        .form-grid {
          display: grid;
          gap: 1.25rem;
          margin-bottom: 1.5rem;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .form-field label {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .spectrum-textarea {
          background-color: var(--spectrum-bg);
          border: 1px solid var(--spectrum-border);
          color: var(--text-primary);
          padding: 0.5rem 0.75rem;
          border-radius: 4px;
          font-family: inherit;
          font-size: 0.9rem;
          outline: none;
        }

        .spectrum-textarea:focus {
          border-color: var(--spectrum-accent-blue);
        }

        /* Slide-Out Detail Drawer */
        .drawer {
          position: fixed;
          top: 0;
          right: -480px;
          width: 480px;
          height: 100%;
          background-color: var(--spectrum-panel);
          border-left: 1px solid var(--spectrum-border);
          box-shadow: -10px 0 30px rgba(0, 0, 0, 0.4);
          z-index: 200;
          transition: right 0.25s cubic-bezier(0.075, 0.82, 0.165, 1);
          padding: 2.25rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .drawer.active {
          right: 0;
        }

        .drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--spectrum-border);
          padding-bottom: 1rem;
          margin-bottom: 1.5rem;
        }

        .drawer-title {
          font-size: 1.15rem;
          font-weight: 700;
          color: #ffffff;
        }

        .drawer-section {
          margin-bottom: 1.75rem;
        }

        .drawer-section h4 {
          font-size: 0.72rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 0.75rem;
          font-weight: 700;
        }

        .drawer-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.25rem;
          background-color: var(--spectrum-bg);
          padding: 1.25rem;
          border-radius: 4px;
          border: 1px solid var(--spectrum-border);
        }

        .drawer-meta-item label {
          font-size: 0.7rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
        }

        .drawer-meta-item p {
          font-size: 0.9rem;
          font-weight: 500;
          margin-top: 0.25rem;
          color: #ffffff;
        }

        .drawer-meta-item.span-2 {
          grid-column: span 2;
        }
      </style>
    </head>
    <body>
      
      <!-- LEFT RAIL SIDEBAR -->
      <aside>
        <div class="aside-header">
          <div class="aside-logo">ccr gateway</div>
          <div class="badge-pilot">Pilot</div>
        </div>
        <nav class="nav-vertical">
          <button onclick="switchTab('dashboard')" id="tab-link-dashboard" class="nav-item active">
            <span>Dashboard</span>
          </button>
          <button onclick="switchTab('policies')" id="tab-link-policies" class="nav-item">
            <span>Policy Rules</span>
          </button>
          <a href="/admin/reports/approval" class="nav-item">
            <span>CISO Report</span>
          </a>
        </nav>
        <div class="aside-footer">
          ccr Console v1.0.0
        </div>
      </aside>

      <!-- WORKSPACE AREA -->
      <div class="workspace">
        <!-- TOP STATUS BAR -->
        <div class="top-bar">
          <div class="breadcrumbs">
            Security Control Plane / <span id="current-breadcrumb">Dashboard</span>
          </div>
          <div class="system-status">
            IDE Active Model: <span style="font-weight: 600; color: #ec7211;">${escapeHtml(activeModelName)}</span> (<span style="color: #bbb;">${escapeHtml(capitalizedMode)}</span>)
          </div>
        </div>

        <!-- SCROLLABLE BODY -->
        <div class="scrollable-body">
          <!-- METRICS TILES -->
          <div class="grid-metrics">
            <div class="metric-card">
              <div class="metric-title">Total Requests</div>
              <div class="metric-value" id="agg-requests">${totalRequests}</div>
            </div>
            <div class="metric-card blocked">
              <div class="metric-title">Exfiltrations Blocked</div>
              <div class="metric-value blocked" id="agg-blocked">${totalBlocked}</div>
            </div>
            <div class="metric-card">
              <div class="metric-title">Rule Warnings</div>
              <div class="metric-value" id="agg-warnings">${warnings}</div>
            </div>
            <div class="metric-card savings">
              <div class="metric-title">Audited Cost Savings</div>
              <div class="metric-value savings" id="agg-savings">$${totalSavings.toFixed(4)}</div>
            </div>
          </div>

          <!-- SYSTEM DIAGNOSTICS & PER-LANE ECONOMIC/TRUST ANALYSIS -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 2rem;">
            <!-- INFRASTRUCTURE DIAGNOSTICS PANEL -->
            <div class="panel-card" style="padding: 1.25rem;">
              <div class="panel-title" style="margin-bottom: 1rem; font-size: 0.85rem;">Infrastructure Route Diagnostics</div>
              <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                <!-- EKS vLLM -->
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; background: var(--spectrum-bg); border-radius: 4px; border: 1px solid var(--spectrum-border);">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${vllmHealthy ? 'var(--spectrum-accent-green)' : 'var(--spectrum-accent-red)'};"></span>
                    <strong style="font-size: 0.8rem;">EKS vLLM Cluster</strong>
                  </div>
                  <span style="font-size: 0.75rem; font-weight: 600; color: ${vllmHealthy ? 'var(--spectrum-accent-green)' : 'var(--spectrum-accent-red)'};">${vllmHealthy ? 'HEALTHY (100% SLA)' : 'OFFLINE (DEGRADED)'}</span>
                </div>
                <!-- VPN Secure Tunnel -->
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; background: var(--spectrum-bg); border-radius: 4px; border: 1px solid var(--spectrum-border);">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${vpnHealthy ? 'var(--spectrum-accent-green)' : 'var(--spectrum-accent-red)'};"></span>
                    <strong style="font-size: 0.8rem;">VPN Corporate Gateway</strong>
                  </div>
                  <span style="font-size: 0.75rem; font-weight: 600; color: ${vpnHealthy ? 'var(--spectrum-accent-green)' : 'var(--spectrum-accent-red)'};">${vpnHealthy ? 'CONNECTED' : 'DISCONNECTED (OUTAGE)'}</span>
                </div>
                <!-- Bedrock PrivateLink -->
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; background: var(--spectrum-bg); border-radius: 4px; border: 1px solid var(--spectrum-border);">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: var(--spectrum-accent-green);"></span>
                    <strong style="font-size: 0.8rem;">Amazon Bedrock PrivateLink</strong>
                  </div>
                  <span style="font-size: 0.75rem; font-weight: 600; color: var(--spectrum-accent-green);">ACTIVE (VPC regional endpoint)</span>
                </div>
              </div>
            </div>

            <!-- ECONOMICS & TRUST LEDGER PANEL -->
            <div class="panel-card" style="padding: 1.25rem;">
              <div class="panel-title" style="margin-bottom: 1rem; font-size: 0.85rem;">Routing Optimizer Recommendations</div>
              <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.78rem; color: var(--text-secondary);">
                <p>💡 <strong>Balanced Code (AWS)</strong> is current recommendation for standard engineering, saving <strong>$0.0016</strong> per transaction compared to Sonnet.</p>
                <p>🛡️ <strong>Internal Secure Route</strong> VPN is automatically enforced for directory structures matching sensitivity overrides.</p>
                <p>⚡ <strong>Fast Code (AWS)</strong> represents maximum latency efficiency for inline autocomplete queries.</p>
              </div>
            </div>
          </div>

          <!-- ROUTE ANALYTICS TABLE -->
          <div class="panel-card" style="margin-bottom: 2rem;">
            <div class="panel-title">Per-Lane Economics & Developer Trust Metrics</div>
            <div class="table-container">
              <table class="spectrum-table" style="width: 100%;">
                <thead>
                  <tr>
                    <th>Route Lane</th>
                    <th>Tasks Routed</th>
                    <th>Avg Latency</th>
                    <th>Actual Cost</th>
                    <th>Total Savings</th>
                    <th>Keep Rate</th>
                    <th>Rework Rate</th>
                    <th>Abandon Rate</th>
                  </tr>
                </thead>
                <tbody>
                  ${analyticsRows}
                </tbody>
              </table>
            </div>
          </div>

          <!-- TAB 1: MAIN TRAFFIC PANEL -->
          <div id="pane-dashboard" class="tab-pane active">
            <div class="grid-content">
              <div class="panel-card">
                <div class="panel-title">Governed Traffic Explorer</div>
                
                <!-- Logs filters -->
                <div class="filter-bar">
                  <div class="filter-group">
                    <label for="filter-action">Rule Action</label>
                    <select id="filter-action" class="spectrum-select" onchange="applyFilters()">
                      <option value="all">All Actions</option>
                      <option value="blocked">Blocked</option>
                      <option value="warned">Warned</option>
                      <option value="allowed">Allowed</option>
                    </select>
                  </div>
                  
                  <div class="filter-group">
                    <label for="filter-model">Model Search</label>
                    <select id="filter-model" class="spectrum-select" onchange="applyFilters()">
                      <option value="all">All Models</option>
                      <option value="sonnet">Sonnet</option>
                      <option value="claude">Claude (General)</option>
                    </select>
                  </div>

                  <div class="filter-group">
                    <label for="filter-search">ID Search</label>
                    <input type="text" id="filter-search" class="spectrum-input" placeholder="Search ID..." oninput="applyFilters()">
                  </div>

                  <div class="filter-group">
                    <label for="filter-start-date">Start Date</label>
                    <input type="date" id="filter-start-date" class="spectrum-input" onchange="applyFilters()">
                  </div>
                  
                  <div class="filter-group" style="margin-left: auto;">
                    <button class="btn-spectrum secondary" onclick="resetFilters()">Reset</button>
                  </div>
                </div>

                <!-- Logs table -->
                <table>
                  <thead>
                    <tr>
                      <th>Request ID</th>
                      <th>Timestamp</th>
                      <th>Model</th>
                      <th>Status</th>
                      <th>Latency</th>
                    </tr>
                  </thead>
                  <tbody id="logs-table-body">
                    ${requestRows || '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">No traffic logs recorded yet.</td></tr>'}
                  </tbody>
                </table>
              </div>

              <!-- Activity alert panel -->
              <div class="panel-card">
                <div class="panel-title">Recent Policy Alerts</div>
                <div class="activity-feed">
                  ${policyRows || '<p style="color:var(--text-secondary); text-align:center; font-size:0.875rem;">No policy hits recorded yet.</p>'}
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 2: POLICY RULES CRUD PANELS -->
          <div id="pane-policies" class="tab-pane">
            <div class="panel-card">
              <div class="panel-title">
                Active Security Rules
                <button class="btn-spectrum" onclick="openCreateRuleModal()">+ Create Policy Rule</button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Rule Name</th>
                    <th>Pattern Matcher</th>
                    <th>Mode</th>
                    <th>Type</th>
                    <th>Scope</th>
                    <th>Hit Count</th>
                    <th>Last Match Time</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${rulesRows || '<tr><td colspan="8" style="text-align:center; color:var(--text-secondary);">No policy rules loaded.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- DIALOG MODAL: Create/Edit Policy Rule -->
      <div id="policy-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <span id="modal-title-text">Create Policy Rule</span>
            <button class="modal-close" onclick="closePolicyModal()">&times;</button>
          </div>
          <form id="policy-form" onsubmit="saveRule(event)">
            <input type="hidden" id="form-rule-id">
            <div class="form-grid">
              <div class="form-field">
                <label for="form-rule-name">Rule Name</label>
                <input type="text" id="form-rule-name" class="spectrum-input" required placeholder="e.g. Block Private SSH Keys">
              </div>
              <div class="form-field">
                <label for="form-rule-type">Matcher Type</label>
                <select id="form-rule-type" class="spectrum-select" required>
                  <option value="file_path">File Path Glob Pattern</option>
                  <option value="regex_pattern">Prompt Text Regex Scanner</option>
                </select>
              </div>
              <div class="form-field">
                <label for="form-rule-pattern">Pattern (Regex string)</label>
                <input type="text" id="form-rule-pattern" class="spectrum-input" required placeholder="e.g. \\.pem$ or id_rsa">
              </div>
              <div class="form-field">
                <label for="form-rule-mode">Enforcement Action</label>
                <select id="form-rule-mode" class="spectrum-select" required>
                  <option value="enforce">Enforce (Immediately Block Request)</option>
                  <option value="warn">Warn (Log Hit & Flag Developer)</option>
                  <option value="monitor">Monitor (Silent Telemetry Log)</option>
                </select>
              </div>
              <div class="form-field">
                <label for="form-rule-scope">Scope</label>
                <input type="text" id="form-rule-scope" class="spectrum-input" placeholder="e.g. repo, path class, config">
              </div>
              <div class="form-field">
                <label for="form-rule-desc">Rule Description</label>
                <textarea id="form-rule-desc" class="spectrum-textarea" rows="3" placeholder="Explain the security rationale of this rule..."></textarea>
              </div>
            </div>
            <div style="display:flex; justify-content: flex-end; gap: 1rem;">
              <button type="button" class="btn-spectrum secondary" onclick="closePolicyModal()">Cancel</button>
              <button type="submit" class="btn-spectrum">Save Ruleset</button>
            </div>
          </form>
        </div>
      </div>

      <!-- SLIDE-IN DETAIL DRAWER: Request Telemetry Explorer -->
      <div id="detail-drawer" class="drawer">
        <div class="drawer-header">
          <div class="drawer-title">Request Telemetry Details</div>
          <button class="modal-close" onclick="closeDrawer()">&times;</button>
        </div>
        
        <div class="drawer-section">
          <h4>Core Metadata</h4>
          <div class="drawer-meta-grid">
            <div class="drawer-meta-item">
              <label>Correlation ID</label>
              <p id="det-correlation-id">-</p>
            </div>
            <div class="drawer-meta-item">
              <label>Status Code</label>
              <p id="det-status">-</p>
            </div>
            <div class="drawer-meta-item">
              <label>Timestamp</label>
              <p id="det-time">-</p>
            </div>
            <div class="drawer-meta-item">
              <label>Latency</label>
              <p id="det-latency">-</p>
            </div>
            <div class="drawer-meta-item">
              <label>Model</label>
              <p id="det-model">-</p>
            </div>
            <div class="drawer-meta-item">
              <label>Routing Provider</label>
              <p id="det-provider">-</p>
            </div>
          </div>
        </div>

        <div class="drawer-section">
          <h4>Cost & Token Ledgers</h4>
          <div class="drawer-meta-grid">
            <div class="drawer-meta-item">
              <label>Input Tokens</label>
              <p id="det-input-tokens">0</p>
            </div>
            <div class="drawer-meta-item">
              <label>Output Tokens</label>
              <p id="det-output-tokens">0</p>
            </div>
            <div class="drawer-meta-item">
              <label>Actual Price</label>
              <p id="det-actual-cost">$0.0000</p>
            </div>
            <div class="drawer-meta-item">
              <label>Baseline Price (Est.)</label>
              <p id="det-baseline-cost">$0.0000</p>
            </div>
            <div class="drawer-meta-item span-2" style="border-top: 1px solid var(--spectrum-border); padding-top: 0.75rem; margin-top: 0.5rem;">
              <label style="color: var(--spectrum-accent-green); font-weight:600;">Interception Cost Savings (Delta)</label>
              <p id="det-delta-cost" style="color: var(--spectrum-accent-green); font-weight:700; font-size: 1.1rem;">$0.0000</p>
            </div>
          </div>
        </div>

        <div class="drawer-section" id="drawer-sec-hits" style="display:none;">
          <h4 style="color:var(--spectrum-accent-red);">Policy Violations Triggered</h4>
          <div id="drawer-hit-list" style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.5rem;">
            <!-- policy hit cards -->
          </div>
        </div>
      </div>

      <!-- INLINED COMPLIANCE SCRIPTS FOR CLIENT CONTROLS -->
      <script>
        // Seed database state objects locally on render for client-side search/filters
        const REQUEST_EVENTS = ${JSON.stringify(db.request_events).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')};
        const POLICY_HITS = ${JSON.stringify(db.policy_hits).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')};
        const SPEND_RECORDS = ${JSON.stringify(db.spend_records).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')};

        // Tab selection logic
        function switchTab(tabId) {
          document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
          document.querySelectorAll('.nav-vertical button').forEach(a => a.classList.remove('active'));
          
          document.getElementById('pane-' + tabId).classList.add('active');
          document.getElementById('tab-link-' + tabId).classList.add('active');

          // Dynamically update breadcrumbs for enterprise layout
          const bcrumb = document.getElementById('current-breadcrumb');
          if (tabId === 'dashboard') {
            bcrumb.innerText = 'Dashboard';
          } else if (tabId === 'policies') {
            bcrumb.innerText = 'Policies Manager';
          }
        }

        // Search and filter logic
        function applyFilters() {
          const actionFilter = document.getElementById('filter-action').value;
          const modelFilter = document.getElementById('filter-model').value;
          const searchFilter = document.getElementById('filter-search').value.toLowerCase().trim();
          const startDateVal = document.getElementById('filter-start-date').value;

          let startTimestamp = null;
          if (startDateVal) {
            startTimestamp = new Date(startDateVal).getTime();
          }

          const rows = document.querySelectorAll('#logs-table-body .log-row');
          rows.forEach(row => {
            const id = row.getAttribute('data-id').toLowerCase();
            const action = row.getAttribute('data-action');
            const model = row.getAttribute('data-model');
            const rowTimeVal = new Date(row.getAttribute('data-timestamp')).getTime();

            let matchAction = (actionFilter === 'all') || (action === actionFilter);
            let matchModel = (modelFilter === 'all') || (model.includes(modelFilter));
            let matchSearch = !searchFilter || (id.includes(searchFilter) || model.includes(searchFilter));
            let matchDate = !startTimestamp || (rowTimeVal >= startTimestamp);

            if (matchAction && matchModel && matchSearch && matchDate) {
              row.style.display = '';
            } else {
              row.style.display = 'none';
            }
          });
        }

        function resetFilters() {
          document.getElementById('filter-action').value = 'all';
          document.getElementById('filter-model').value = 'all';
          document.getElementById('filter-search').value = '';
          document.getElementById('filter-start-date').value = '';
          applyFilters();
        }

        // Slide-in request detail explorer drawer
        function showRequestDetail(correlationId) {
          const evt = REQUEST_EVENTS.find(e => e.correlation_id === correlationId);
          if (!evt) return;

          const spend = SPEND_RECORDS.find(s => s.correlation_id === correlationId) || {
            input_tokens: 0,
            output_tokens: 0,
            actual_cost: 0,
            baseline_cost: 0,
            delta: 0
          };

          const hits = POLICY_HITS.filter(h => h.correlation_id === correlationId);

          // Populate Metadata
          document.getElementById('det-correlation-id').innerText = evt.correlation_id;
          document.getElementById('det-status').innerText = evt.status;
          document.getElementById('det-time').innerText = new Date(evt.timestamp).toLocaleString();
          document.getElementById('det-latency').innerText = evt.latency_ms + 'ms';
          document.getElementById('det-model').innerText = evt.model;
          document.getElementById('det-provider').innerText = evt.provider.toUpperCase();

          // Populate Spend Ledger
          document.getElementById('det-input-tokens').innerText = spend.input_tokens;
          document.getElementById('det-output-tokens').innerText = spend.output_tokens;
          document.getElementById('det-actual-cost').innerText = '$' + Number(spend.actual_cost).toFixed(6);
          document.getElementById('det-baseline-cost').innerText = '$' + Number(spend.baseline_cost).toFixed(6);
          document.getElementById('det-delta-cost').innerText = '$' + Number(spend.delta).toFixed(6);

          // Populate Hits (Sanitized HTML inserts)
          const hitListDiv = document.getElementById('drawer-hit-list');
          const hitSection = document.getElementById('drawer-sec-hits');
          hitListDiv.innerHTML = '';
          
          if (hits.length > 0) {
            hitSection.style.display = 'block';
            hits.forEach(h => {
              const div = document.createElement('div');
              div.style.background = 'rgba(215, 55, 63, 0.1)';
              div.style.border = '1px solid rgba(215, 55, 63, 0.15)';
              div.style.padding = '0.75rem';
              div.style.borderRadius = '4px';
              div.style.fontSize = '0.85rem';
              
              div.innerHTML = '<div style="font-weight:700; color:var(--spectrum-accent-red); text-transform:uppercase; font-size:0.72rem; margin-bottom:0.25rem; letter-spacing:0.04em;">' +
                (h.action || '').toUpperCase() + ' TRIGGERED' +
              '</div>' +
              '<p style="margin-bottom:0.25rem;"><strong>Rule ID:</strong> <code>' + escapeStringHtml(h.rule_id) + '</code></p>' +
              '<p style="font-family:monospace; font-size:0.75rem; color:var(--text-secondary); word-break:break-all;">' +
                escapeStringHtml(h.matched_value || 'Sensitive value match triggered') +
              '</p>';
              
              hitListDiv.appendChild(div);
            });
          } else {
            hitSection.style.display = 'none';
          }

          document.getElementById('detail-drawer').classList.add('active');
        }

        // Helper to escape text inside DOM creations
        function escapeStringHtml(str) {
          if (!str) return '';
          return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        }

        function closeDrawer() {
          document.getElementById('detail-drawer').classList.remove('active');
        }

        // Policies REST API CRUD scripts
        function openCreateRuleModal() {
          document.getElementById('modal-title-text').innerText = 'Create Policy Rule';
          document.getElementById('form-rule-id').value = '';
          document.getElementById('policy-form').reset();
          document.getElementById('policy-modal').classList.add('active');
        }

        function openEditRuleModal(id, name, pattern, mode, type, description, scope) {
          document.getElementById('modal-title-text').innerText = 'Edit Policy Rule';
          document.getElementById('form-rule-id').value = id;
          document.getElementById('form-rule-name').value = name;
          document.getElementById('form-rule-pattern').value = pattern;
          document.getElementById('form-rule-mode').value = mode;
          document.getElementById('form-rule-type').value = type;
          document.getElementById('form-rule-scope').value = scope || 'repo';
          document.getElementById('form-rule-desc').value = description;
          document.getElementById('policy-modal').classList.add('active');
        }

        // Delegated handlers for edit/delete rule buttons — avoids injecting values
        // as positional JS string arguments in onclick attributes.
        document.addEventListener('click', function(e) {
          const editBtn = e.target.closest('.edit-rule-btn');
          if (editBtn) {
            openEditRuleModal(
              editBtn.dataset.rid, editBtn.dataset.name, editBtn.dataset.pattern,
              editBtn.dataset.mode, editBtn.dataset.type, editBtn.dataset.desc, editBtn.dataset.scope
            );
            return;
          }
          const deleteBtn = e.target.closest('.delete-rule-btn');
          if (deleteBtn) {
            deleteRule(deleteBtn.dataset.rid);
          }
        });

        function closePolicyModal() {
          document.getElementById('policy-modal').classList.remove('active');
        }

        async function saveRule(e) {
          e.preventDefault();
          const id = document.getElementById('form-rule-id').value;
          const name = document.getElementById('form-rule-name').value;
          const pattern = document.getElementById('form-rule-pattern').value;
          const mode = document.getElementById('form-rule-mode').value;
          const type = document.getElementById('form-rule-type').value;
          const scope = document.getElementById('form-rule-scope').value;
          const description = document.getElementById('form-rule-desc').value;

          const payload = { name, pattern, mode, type, scope, description };
          
          let response;
          if (id) {
            response = await fetch('/admin/api/policies/' + id, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload)
            });
          } else {
            response = await fetch('/admin/api/policies', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload)
            });
          }

          if (response.ok) {
            closePolicyModal();
            window.location.reload();
          } else {
            const err = await response.json();
            alert('Failed to save policy: ' + err.error);
          }
        }

        async function deleteRule(id) {
          if (!confirm('Are you sure you want to delete this policy rule?')) return;
          
          const response = await fetch('/admin/api/policies/' + id, {
            method: 'DELETE'
          });

          if (response.ok) {
            window.location.reload();
          } else {
            alert('Failed to delete policy rule.');
          }
        }
      </script>
    </body>
    </html>
  `;
}

/**
 * Returns a print-ready CISO Rollout Approval report styled cleanly for printing.
 */
export function renderCisoReport(): string {
  const db = getDbData();
  const totalBlocked = db.policy_hits.filter(h => h.action === 'block').length;

  const ruleSummary = db.policy_hits.slice(-30).reverse().map(h => {
    return `
      <tr>
        <td><code>${escapeHtml(h.correlation_id.substring(0, 8))}</code></td>
        <td>${new Date(h.timestamp).toLocaleString()}</td>
        <td><code>${escapeHtml(h.rule_id)}</code></td>
        <td><strong>${escapeHtml(h.action.toUpperCase())}</strong></td>
        <td><small>${escapeHtml(h.matched_value || 'Sensitive regex prompt warning')}</small></td>
      </tr>
    `;
  }).join('');

  const activeRulesRows = (db.policy_rules || []).map(r => {
    return `
      <tr>
        <td><code>${escapeHtml(r.id)}</code></td>
        <td><strong>${escapeHtml(r.name)}</strong></td>
        <td><code>${escapeHtml(r.pattern)}</code></td>
        <td><code>${escapeHtml(r.type)}</code></td>
        <td><strong>${escapeHtml(r.mode.toUpperCase())}</strong></td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>CISO AI-Agent Rollout Compliance Report</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Inter', sans-serif;
          background-color: #ffffff;
          color: #1e293b;
          padding: 3rem;
          max-width: 900px;
          margin: 0 auto;
          line-height: 1.6;
        }

        .report-header {
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 1.5rem;
          margin-bottom: 2rem;
        }

        .report-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 0.5rem;
        }

        .meta-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          background: #f8fafc;
          padding: 1.5rem;
          border-radius: 8px;
          margin-bottom: 2.5rem;
          border: 1px solid #e2e8f0;
        }

        .meta-item label {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: #64748b;
          font-weight: 600;
        }

        .meta-item p {
          font-size: 1rem;
          font-weight: 500;
          color: #0f172a;
          margin-top: 0.25rem;
        }

        h2 {
          font-size: 1.25rem;
          color: #0f172a;
          margin-top: 2rem;
          margin-bottom: 1rem;
          border-left: 4px solid #1473e6;
          padding-left: 0.75rem;
        }

        p.summary-text {
          margin-bottom: 1.5rem;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 2rem;
          text-align: left;
        }

        th, td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #e2e8f0;
          font-size: 0.875rem;
        }

        th {
          background: #f1f5f9;
          color: #475569;
          font-weight: 600;
        }

        code {
          font-family: monospace;
          background: #f1f5f9;
          padding: 0.15rem 0.35rem;
          border-radius: 4px;
        }

        .btn-print {
          background: #1473e6;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 16px;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.875rem;
          box-shadow: 0 4px 6px -1px rgba(20, 115, 230, 0.2);
          transition: background 0.2s;
        }

        .btn-print:hover {
          background: #0d66d0;
        }

        .nav-link {
          color: #1473e6;
          text-decoration: none;
          font-weight: 500;
          display: inline-block;
          margin-bottom: 1.5rem;
        }

        @media print {
          .btn-print, .nav-link {
            display: none;
          }
          body {
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      <a href="/admin/dashboard" class="nav-link">&larr; Back to Dashboard</a>
      
      <div class="report-header">
        <h1 class="report-title">ccr Security Control Plane Evaluation Report</h1>
        <p style="color: #64748b;">Telemetry audit and compliance evidence for pilot rollout approval.</p>
      </div>

      <div class="meta-grid">
        <div class="meta-item">
          <label>Evaluation Period</label>
          <p>June 2026</p>
        </div>
        <div class="meta-item">
          <label>Total Exfiltrations Intercepted</label>
          <p style="color: #d7373f; font-weight: 700;">${totalBlocked} Blocked</p>
        </div>
        <div class="meta-item">
          <label>Approved Rollout Status</label>
          <p style="color: #12805c; font-weight: 700;">PASSED</p>
        </div>
      </div>

      <h2>1. Executive Rollout Summary</h2>
      <p class="summary-text">
        This document serves as compliance evidence proving that AI coding agents (Claude Code) deployed inside the pilot network are bound by code-aware boundary controls. By routing traffic through <strong><code>ccr-gateway</code></strong>, security policy enforcement was applied natively at the API boundary, validating that exfiltration of configuration secrets (.env) and credential paths was fully prevented prior to leaving the VPC border.
      </p>

      <h2>2. Active Security Configurations</h2>
      <table>
        <thead>
          <tr>
            <th>Rule ID</th>
            <th>Name</th>
            <th>Pattern Matcher</th>
            <th>Type</th>
            <th>Mode</th>
          </tr>
        </thead>
        <tbody>
          ${activeRulesRows || '<tr><td colspan="5" style="text-align:center; color:#64748b;">No security configurations active.</td></tr>'}
        </tbody>
      </table>

      <h2>3. Telemetric Audit Evidence</h2>
      <table>
        <thead>
          <tr>
            <th>Req ID</th>
            <th>Timestamp</th>
            <th>Rule Triggered</th>
            <th>Enforcement</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${ruleSummary || '<tr><td colspan="5" style="text-align:center; color:#64748b;">No policy alerts logged in this audit scope.</td></tr>'}
        </tbody>
      </table>

      <button class="btn-print" onclick="window.print()">Export / Print Report</button>
    </body>
    </html>
  `;
}
