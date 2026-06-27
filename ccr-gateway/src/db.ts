import * as fs from 'fs';
import * as path from 'path';

const DB_FILE = path.join(process.cwd(), 'ccr_database.json');

export interface RequestEvent {
  id: string;
  correlation_id: string;
  timestamp: string;
  model: string;
  provider: string;
  status: number;
  latency_ms: number;
}

export interface PolicyHit {
  id: string;
  correlation_id: string;
  rule_id: string;
  action: string;
  matched_value: string | null;
  timestamp: string;
}

export interface SpendRecord {
  id: string;
  correlation_id: string;
  input_tokens: number;
  output_tokens: number;
  actual_cost: number;
  baseline_cost: number;
  delta: number;
  timestamp: string;
}

export interface RepoConfig {
  repo_identifier: string;
  ignore_rules: string;
}

import { PolicyRule, DEFAULT_RULES } from './policy.js';

interface DatabaseSchema {
  request_events: RequestEvent[];
  policy_hits: PolicyHit[];
  spend_records: SpendRecord[];
  repo_configs: RepoConfig[];
  policy_rules: PolicyRule[];
}

/**
 * Reads database contents from local JSON file.
 */
function readDb(): DatabaseSchema {
  if (!fs.existsSync(DB_FILE)) {
    return {
      request_events: [],
      policy_hits: [],
      spend_records: [],
      repo_configs: [],
      policy_rules: []
    };
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
    console.error('Failed to read local database file, returning empty schema.');
    return {
      request_events: [],
      policy_hits: [],
      spend_records: [],
      repo_configs: [],
      policy_rules: []
    };
  }
}

/**
 * Writes database contents to local JSON file.
 */
function writeDb(data: DatabaseSchema): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e: any) {
    console.error(`Failed to write local database file: ${e.message}`);
  }
}

/**
 * Initializes the database.
 */
export async function initDatabase(): Promise<void> {
  console.log(`Initializing JSON database at ${DB_FILE}...`);
  if (!fs.existsSync(DB_FILE)) {
    writeDb({
      request_events: [],
      policy_hits: [],
      spend_records: [],
      repo_configs: [],
      policy_rules: DEFAULT_RULES.map(r => ({ ...r, hit_count: 0 }))
    });
  } else {
    // Seed policy_rules if they are missing or empty
    const db = readDb();
    if (!db.policy_rules || db.policy_rules.length === 0) {
      db.policy_rules = DEFAULT_RULES.map(r => ({ ...r, hit_count: 0 }));
      writeDb(db);
    }
  }
  console.log('JSON database successfully initialized.');
}

/**
 * Retrieve all active policy rules.
 */
export function getPolicies(): PolicyRule[] {
  const db = readDb();
  return db.policy_rules || [];
}

/**
 * Add or update a policy rule.
 */
export function savePolicy(rule: PolicyRule): void {
  const db = readDb();
  if (!db.policy_rules) {
    db.policy_rules = [];
  }
  const idx = db.policy_rules.findIndex(r => r.id === rule.id);
  if (idx > -1) {
    db.policy_rules[idx] = {
      ...db.policy_rules[idx],
      ...rule,
      hit_count: db.policy_rules[idx].hit_count || 0,
      last_matched_at: db.policy_rules[idx].last_matched_at
    };
  } else {
    db.policy_rules.push({
      ...rule,
      hit_count: 0
    });
  }
  writeDb(db);
}

/**
 * Delete a policy rule.
 */
export function deletePolicy(id: string): void {
  const db = readDb();
  if (db.policy_rules) {
    db.policy_rules = db.policy_rules.filter(r => r.id !== id);
  }
  writeDb(db);
}

/**
 * Increment matching hit counter for a policy rule.
 */
export function incrementPolicyHits(id: string): void {
  const db = readDb();
  if (db.policy_rules) {
    const rule = db.policy_rules.find(r => r.id === id);
    if (rule) {
      rule.hit_count = (rule.hit_count || 0) + 1;
      rule.last_matched_at = new Date().toISOString();
      writeDb(db);
    }
  }
}

/**
 * Log Request Event.
 */
export async function logRequestEvent(
  correlationId: string,
  model: string,
  provider: string,
  status: number,
  latencyMs: number
): Promise<void> {
  const db = readDb();
  const newEvent: RequestEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    correlation_id: correlationId,
    timestamp: new Date().toISOString(),
    model,
    provider,
    status,
    latency_ms: latencyMs
  };
  db.request_events.push(newEvent);
  writeDb(db);
}

/**
 * Log Policy Hit.
 */
export async function logPolicyHit(
  correlationId: string,
  ruleId: string,
  action: string,
  matchedValue?: string
): Promise<void> {
  const db = readDb();
  const newHit: PolicyHit = {
    id: `hit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    correlation_id: correlationId,
    rule_id: ruleId,
    action,
    matched_value: matchedValue || null,
    timestamp: new Date().toISOString()
  };
  db.policy_hits.push(newHit);
  writeDb(db);
}

/**
 * Log Spend Record.
 */
export async function logSpendRecord(
  correlationId: string,
  inputTokens: number,
  outputTokens: number,
  actualCost: number,
  baselineCost: number,
  delta: number
): Promise<void> {
  const db = readDb();
  const newSpend: SpendRecord = {
    id: `spd-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    correlation_id: correlationId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    actual_cost: actualCost,
    baseline_cost: baselineCost,
    delta,
    timestamp: new Date().toISOString()
  };
  db.spend_records.push(newSpend);
  writeDb(db);
}
