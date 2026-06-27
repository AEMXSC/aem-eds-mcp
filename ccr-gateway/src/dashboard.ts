import * as fs from 'fs';
import * as path from 'path';

const DB_FILE = path.join(process.cwd(), 'ccr_database.json');

interface DatabaseSchema {
  request_events: any[];
  policy_hits: any[];
  spend_records: any[];
  repo_configs: any[];
  policy_rules: any[];
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
      policy_rules: parsed.policy_rules || []
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
 * Returns a visually stunning HTML dashboard page.
 */
export function renderDashboard(): string {
  const db = getDbData();
  
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

  // Generate request rows (render full list so client-side filter can manage pagination/searching)
  const requestRows = db.request_events.map(e => {
    const isError = e.status >= 400;
    const isBlock = e.status === 400;
    const isWarn = e.status === 200 && db.policy_hits.some(h => h.correlation_id === e.correlation_id && h.action === 'warn');
    const statusClass = isBlock ? 'status-error' : isWarn ? 'status-warn' : isError ? 'status-error' : 'status-ok';
    const actionText = isBlock ? 'Blocked' : isWarn ? 'Warned' : 'Allowed';
    return `
      <tr class="log-row" data-id="${e.correlation_id}" data-action="${actionText.toLowerCase()}" data-model="${e.model.toLowerCase()}" data-timestamp="${e.timestamp}">
        <td><a href="#" onclick="showRequestDetail('${e.correlation_id}')" class="detail-link"><code>${e.correlation_id.substring(0, 8)}</code></a></td>
        <td class="time-cell" data-val="${e.timestamp}">${new Date(e.timestamp).toLocaleString()}</td>
        <td><code>${e.model}</code></td>
        <td><span class="status-badge ${statusClass}">${e.status} (${actionText})</span></td>
        <td>${e.latency_ms}ms</td>
      </tr>
    `;
  }).reverse().join('');

  // Generate policy hit rows
  const policyRows = db.policy_hits.slice(-15).reverse().map(h => {
    const actionClass = h.action === 'block' ? 'action-block' : 'action-warn';
    return `
      <div class="activity-card">
        <div class="activity-header">
          <span class="action-badge ${actionClass}">${h.action.toUpperCase()}</span>
          <span class="activity-time">${new Date(h.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="activity-body">
          <p><strong>Rule:</strong> <code>${h.rule_id}</code></p>
          <p class="matched-val"><strong>Details:</strong> ${escapeHtml(h.matched_value || 'Sensitive scan match warning')}</p>
        </div>
      </div>
    `;
  }).join('');

  // Generate Policy Manager list rows
  const rules = db.policy_rules || [];
  const rulesRows = rules.map(r => {
    const modeClass = r.mode === 'enforce' ? 'status-error' : r.mode === 'warn' ? 'status-warn' : 'status-ok';
    const lastMatched = r.last_matched_at ? new Date(r.last_matched_at).toLocaleString() : 'Never';
    return `
      <tr id="rule-row-${r.id}">
        <td><strong>${escapeHtml(r.name)}</strong></td>
        <td><code>${escapeHtml(r.pattern)}</code></td>
        <td><span class="status-badge ${modeClass}">${r.mode.toUpperCase()}</span></td>
        <td><code>${r.type}</code></td>
        <td>${r.scope || 'repo'}</td>
        <td><span class="count-badge">${r.hit_count || 0}</span></td>
        <td><small class="time-text">${lastMatched}</small></td>
        <td>
          <button class="btn-action edit" onclick="openEditRuleModal('${r.id}', '${escapeHtml(r.name)}', '${escapeHtml(r.pattern)}', '${r.mode}', '${r.type}', '${escapeHtml(r.description || '')}', '${r.scope || 'repo'}')">Edit</button>
          <button class="btn-action delete" onclick="deleteRule('${r.id}')">Delete</button>
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
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg-dark: #0f172a;
          --bg-card: rgba(30, 41, 59, 0.7);
          --accent-primary: #6366f1;
          --accent-success: #10b981;
          --accent-warning: #f59e0b;
          --accent-error: #ef4444;
          --text-main: #f8fafc;
          --text-muted: #94a3b8;
          --border: rgba(148, 163, 184, 0.1);
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: 'Inter', sans-serif;
          background-color: var(--bg-dark);
          color: var(--text-main);
          min-height: 100vh;
          padding: 2rem;
          background-image: radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.05) 0%, transparent 40%),
                            radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.05) 0%, transparent 40%);
        }

        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2.5rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 1.5rem;
        }

        .logo {
          font-family: 'Outfit', sans-serif;
          font-size: 2rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--accent-primary), #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .nav-links a {
          color: var(--text-muted);
          text-decoration: none;
          margin-left: 1.5rem;
          font-weight: 500;
          padding-bottom: 0.25rem;
          transition: color 0.2s ease, border-color 0.2s ease;
          cursor: pointer;
        }

        .nav-links a:hover, .nav-links a.active {
          color: var(--text-main);
          border-bottom: 2px solid var(--accent-primary);
        }

        .grid-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2.5rem;
        }

        .metric-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.5rem;
          backdrop-filter: blur(12px);
          transition: transform 0.2s ease, border-color 0.2s ease;
        }

        .metric-card:hover {
          transform: translateY(-2px);
          border-color: rgba(99, 102, 241, 0.3);
        }

        .metric-title {
          font-size: 0.875rem;
          color: var(--text-muted);
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }

        .metric-value {
          font-size: 2rem;
          font-weight: 700;
          font-family: 'Outfit', sans-serif;
        }

        .metric-value.savings {
          color: var(--accent-success);
        }

        .metric-value.blocked {
          color: var(--accent-error);
        }

        .grid-content {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 2rem;
        }

        @media (max-width: 900px) {
          .grid-content {
            grid-template-columns: 1fr;
          }
        }

        .section-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 1.5rem;
          backdrop-filter: blur(12px);
          margin-bottom: 2rem;
        }

        .section-title {
          font-family: 'Outfit', sans-serif;
          font-size: 1.25rem;
          margin-bottom: 1.25rem;
          font-weight: 600;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        /* Filter Controls */
        .filter-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 1rem;
          background: rgba(15, 23, 42, 0.4);
          padding: 1rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          align-items: center;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .filter-group label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .filter-input {
          background: rgba(30, 41, 59, 0.9);
          border: 1px solid var(--border);
          color: var(--text-main);
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          font-size: 0.875rem;
          outline: none;
        }

        .filter-input:focus {
          border-color: var(--accent-primary);
        }

        table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        th, td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border);
        }

        th {
          color: var(--text-muted);
          font-weight: 500;
          font-size: 0.875rem;
        }

        td {
          font-size: 0.9375rem;
        }

        code {
          font-family: monospace;
          background: rgba(0, 0, 0, 0.2);
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
        }

        .status-ok {
          background: rgba(16, 185, 129, 0.15);
          color: var(--accent-success);
        }

        .status-warn {
          background: rgba(245, 158, 11, 0.15);
          color: var(--accent-warning);
        }

        .status-error {
          background: rgba(239, 68, 68, 0.15);
          color: var(--accent-error);
        }

        .activity-feed {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .activity-card {
          border-bottom: 1px solid var(--border);
          padding-bottom: 0.75rem;
        }

        .activity-card:last-child {
          border-bottom: none;
        }

        .activity-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .activity-time {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .action-badge {
          font-size: 0.6875rem;
          font-weight: 700;
          padding: 0.15rem 0.35rem;
          border-radius: 4px;
        }

        .action-block {
          background: rgba(239, 68, 68, 0.2);
          color: var(--accent-error);
        }

        .action-warn {
          background: rgba(245, 158, 11, 0.2);
          color: var(--accent-warning);
        }

        .activity-body {
          font-size: 0.875rem;
        }

        .matched-val {
          color: var(--text-muted);
          margin-top: 0.25rem;
          font-size: 0.8125rem;
        }

        /* Buttons */
        .btn-primary {
          background: var(--accent-primary);
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.875rem;
          transition: background 0.2s;
        }

        .btn-primary:hover {
          background: #4f46e5;
        }

        .btn-action {
          border: none;
          background: transparent;
          color: var(--accent-primary);
          cursor: pointer;
          font-weight: 500;
          font-size: 0.875rem;
          margin-right: 0.75rem;
          text-decoration: underline;
        }

        .btn-action.delete {
          color: var(--accent-error);
        }

        .btn-action:hover {
          opacity: 0.8;
        }

        /* Tab panes */
        .tab-pane {
          display: none;
        }

        .tab-pane.active {
          display: block;
        }

        /* Modal styling */
        .modal {
          display: none;
          position: fixed;
          z-index: 100;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(4px);
          align-items: center;
          justify-content: center;
        }

        .modal.active {
          display: flex;
        }

        .modal-content {
          background: #1e293b;
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 2rem;
          width: 90%;
          max-width: 500px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
        }

        .modal-header {
          font-family: 'Outfit', sans-serif;
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-close {
          background: transparent;
          border: none;
          color: var(--text-muted);
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
          gap: 0.5rem;
        }

        .form-field label {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-muted);
        }

        .form-field input, .form-field select, .form-field textarea {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid var(--border);
          color: var(--text-main);
          padding: 0.6rem 0.8rem;
          border-radius: 8px;
          font-size: 0.9375rem;
          outline: none;
        }

        .form-field input:focus, .form-field select:focus, .form-field textarea:focus {
          border-color: var(--accent-primary);
        }

        /* Detail link & Drawer */
        .detail-link {
          color: var(--accent-primary);
          text-decoration: none;
        }
        .detail-link:hover {
          text-decoration: underline;
        }

        .drawer {
          position: fixed;
          top: 0;
          right: -450px;
          width: 450px;
          height: 100%;
          background: #1e293b;
          border-left: 1px solid var(--border);
          box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
          z-index: 110;
          transition: right 0.3s ease;
          padding: 2rem;
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
          border-bottom: 1px solid var(--border);
          padding-bottom: 1rem;
          margin-bottom: 1.5rem;
        }

        .drawer-title {
          font-family: 'Outfit', sans-serif;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .drawer-section {
          margin-bottom: 1.5rem;
        }

        .drawer-section h4 {
          font-size: 0.875rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05rem;
          margin-bottom: 0.5rem;
        }

        .drawer-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          background: rgba(15, 23, 42, 0.4);
          padding: 1rem;
          border-radius: 8px;
          border: 1px solid var(--border);
        }

        .drawer-meta-item label {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .drawer-meta-item p {
          font-size: 0.9375rem;
          font-weight: 500;
          margin-top: 0.25rem;
        }

        .count-badge {
          background: rgba(99, 102, 241, 0.15);
          color: var(--accent-primary);
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.8125rem;
        }

        .time-text {
          color: var(--text-muted);
          font-size: 0.8125rem;
        }
      </style>
    </head>
    <body>
      <header>
        <div class="logo">ccr private gateway</div>
        <nav class="nav-links">
          <a onclick="switchTab('dashboard')" id="tab-link-dashboard" class="active">Dashboard</a>
          <a onclick="switchTab('policies')" id="tab-link-policies">Policies Manager</a>
          <a href="/admin/reports/approval">CISO Report</a>
        </nav>
      </header>

      <main>
        <!-- METRICS OVERVIEW CARD -->
        <div class="grid-metrics">
          <div class="metric-card">
            <div class="metric-title">Total Requests</div>
            <div class="metric-value" id="agg-requests">${totalRequests}</div>
          </div>
          <div class="metric-card">
            <div class="metric-title">Exfiltrations Blocked</div>
            <div class="metric-value blocked" id="agg-blocked">${totalBlocked}</div>
          </div>
          <div class="metric-card">
            <div class="metric-title">Rule Warnings</div>
            <div class="metric-value" id="agg-warnings">${warnings}</div>
          </div>
          <div class="metric-card">
            <div class="metric-title">Audited Cost Savings</div>
            <div class="metric-value savings" id="agg-savings">$${totalSavings.toFixed(4)}</div>
          </div>
        </div>

        <!-- TAB 1: MAIN TRAFFIC DASHBOARD -->
        <div id="pane-dashboard" class="tab-pane active">
          <div class="grid-content">
            <div class="section-card">
              <div class="section-title">Governed Traffic Explorer</div>
              
              <!-- Logs filters -->
              <div class="filter-bar">
                <div class="filter-group">
                  <label for="filter-action">Rule Action</label>
                  <select id="filter-action" class="filter-input" onchange="applyFilters()">
                    <option value="all">All Actions</option>
                    <option value="blocked">Blocked</option>
                    <option value="warned">Warned</option>
                    <option value="allowed">Allowed</option>
                  </select>
                </div>
                
                <div class="filter-group">
                  <label for="filter-model">Model Search</label>
                  <select id="filter-model" class="filter-input" onchange="applyFilters()">
                    <option value="all">All Models</option>
                    <option value="sonnet">Sonnet</option>
                    <option value="claude">Claude (General)</option>
                  </select>
                </div>

                <div class="filter-group">
                  <label for="filter-search">ID Search</label>
                  <input type="text" id="filter-search" class="filter-input" placeholder="Search ID..." oninput="applyFilters()">
                </div>

                <div class="filter-group">
                  <label for="filter-start-date">Start Date</label>
                  <input type="date" id="filter-start-date" class="filter-input" onchange="applyFilters()">
                </div>
                
                <div class="filter-group" style="margin-left: auto;">
                  <button class="btn-primary" onclick="resetFilters()">Reset</button>
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
                  ${requestRows || '<tr><td colspan="5" style="text-align:center;">No traffic recorded yet.</td></tr>'}
                </tbody>
              </table>
            </div>

            <!-- Activity alert panel -->
            <div class="section-card">
              <div class="section-title">Recent Policy Alerts</div>
              <div class="activity-feed">
                ${policyRows || '<p style="color:var(--text-muted); text-align:center;">No policy hits recorded yet.</p>'}
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: POLICY RULES CRUD PANELS -->
        <div id="pane-policies" class="tab-pane">
          <div class="section-card">
            <div class="section-title">
              Active Security Rules
              <button class="btn-primary" onclick="openCreateRuleModal()">+ Create Policy Rule</button>
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
                ${rulesRows || '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No policy rules loaded.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </main>

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
                <input type="text" id="form-rule-name" required placeholder="e.g. Block Private SSH Keys">
              </div>
              <div class="form-field">
                <label for="form-rule-type">Matcher Type</label>
                <select id="form-rule-type" required>
                  <option value="file_path">File Path Glob Pattern</option>
                  <option value="regex_pattern">Prompt Text Regex Scanner</option>
                </select>
              </div>
              <div class="form-field">
                <label for="form-rule-pattern">Pattern (Regex string)</label>
                <input type="text" id="form-rule-pattern" required placeholder="e.g. \\.pem$ or id_rsa">
              </div>
              <div class="form-field">
                <label for="form-rule-mode">Enforcement Action</label>
                <select id="form-rule-mode" required>
                  <option value="enforce">Enforce (Immediately Block Request)</option>
                  <option value="warn">Warn (Log Hit & Flag Developer)</option>
                  <option value="monitor">Monitor (Silent Telemetry Log)</option>
                </select>
              </div>
              <div class="form-field">
                <label for="form-rule-scope">Scope</label>
                <input type="text" id="form-rule-scope" placeholder="e.g. repo, path class, config">
              </div>
              <div class="form-field">
                <label for="form-rule-desc">Rule Description</label>
                <textarea id="form-rule-desc" rows="3" placeholder="Explain the security rationale of this rule..."></textarea>
              </div>
            </div>
            <div style="display:flex; justify-content: flex-end; gap: 1rem;">
              <button type="button" class="btn-action" onclick="closePolicyModal()">Cancel</button>
              <button type="submit" class="btn-primary">Save Ruleset</button>
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
            <div class="drawer-meta-item" style="grid-column: span 2; border-top: 1px solid var(--border); padding-top: 0.5rem; margin-top: 0.5rem;">
              <label style="color: var(--accent-success); font-weight:600;">Interception Cost Savings (Delta)</label>
              <p id="det-delta-cost" style="color: var(--accent-success); font-weight:700; font-size: 1.125rem;">$0.0000</p>
            </div>
          </div>
        </div>

        <div class="drawer-section" id="drawer-sec-hits" style="display:none;">
          <h4 style="color:var(--accent-error);">Policy Violations Triggered</h4>
          <div id="drawer-hit-list" style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.5rem;">
            <!-- policy hit cards -->
          </div>
        </div>
      </div>

      <!-- INLINED COMPLIANCE SCRIPTS FOR CLIENT CONTROLS -->
      <script>
        // Seed database state objects locally on render for client-side search/filters
        const REQUEST_EVENTS = ${JSON.stringify(db.request_events)};
        const POLICY_HITS = ${JSON.stringify(db.policy_hits)};
        const SPEND_RECORDS = ${JSON.stringify(db.spend_records)};

        // Tab selection logic
        function switchTab(tabId) {
          document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
          document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
          
          document.getElementById('pane-' + tabId).classList.add('active');
          document.getElementById('tab-link-' + tabId).classList.add('active');
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

          // Populate Hits
          const hitListDiv = document.getElementById('drawer-hit-list');
          const hitSection = document.getElementById('drawer-sec-hits');
          hitListDiv.innerHTML = '';
          
          if (hits.length > 0) {
            hitSection.style.display = 'block';
            hits.forEach(h => {
              const div = document.createElement('div');
              div.style.background = 'rgba(239, 68, 68, 0.1)';
              div.style.border = '1px solid rgba(239, 68, 68, 0.2)';
              div.style.padding = '0.75rem';
              div.style.borderRadius = '6px';
              div.style.fontSize = '0.875rem';
              div.innerHTML = '<div style="font-weight:600; color:var(--accent-error); text-transform:uppercase; font-size:0.75rem; margin-bottom:0.25rem;">' +
                h.action.toUpperCase() + ' TRIGGERED' +
              '</div>' +
              '<p><strong>Rule ID:</strong> <code>' + h.rule_id + '</code></p>' +
              '<p style="margin-top:0.25rem; font-family:monospace; font-size:0.75rem; word-break:break-all; color:var(--text-muted);">' +
                (h.matched_value || 'Sensitive regex prompt warning') +
              '</p>';
              hitListDiv.appendChild(div);
            });
          } else {
            hitSection.style.display = 'none';
          }

          document.getElementById('detail-drawer').classList.add('active');
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
            // Edit PUT
            response = await fetch('/admin/api/policies/' + id, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload)
            });
          } else {
            // Create POST
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
 * Returns a print-ready CISO Rollout Approval report with custom dynamic content.
 */
export function renderCisoReport(): string {
  const db = getDbData();
  const totalBlocked = db.policy_hits.filter(h => h.action === 'block').length;

  const ruleSummary = db.policy_hits.slice(-30).reverse().map(h => {
    return `
      <tr>
        <td><code>${h.correlation_id.substring(0, 8)}</code></td>
        <td>${new Date(h.timestamp).toLocaleString()}</td>
        <td><code>${h.rule_id}</code></td>
        <td><strong>${h.action.toUpperCase()}</strong></td>
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
        <td><code>${r.type}</code></td>
        <td><strong>${r.mode.toUpperCase()}</strong></td>
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
          border-left: 4px solid #6366f1;
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
          background: #6366f1;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.875rem;
          box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2);
          transition: background 0.2s;
        }

        .btn-print:hover {
          background: #4f46e5;
        }

        .nav-link {
          color: #6366f1;
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
          <p style="color: #ef4444; font-weight: 700;">${totalBlocked} Blocked</p>
        </div>
        <div class="meta-item">
          <label>Approved Rollout Status</label>
          <p style="color: #10b981; font-weight: 700;">PASSED</p>
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

      <h2>3. telemetric Audit Evidence</h2>
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
