import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

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

export interface FeedbackRecord {
  id: string;
  correlationId: string;
  outcome: string;
  rating: string;
  comments: string;
  timestamp: string;
}

export interface ToolCallRecord {
  id: string;
  session_id: string;
  timestamp: number;
  tool_name: string;
  tool_args_hash: string;
  tool_result_status?: 'success' | 'failure';
  file_path?: string;
  line_range?: string;
}

export interface CacheSpendRecord {
  id: string;
  correlation_id: string;
  original_tokens: number;
  cached_tokens: number;
  actual_cost: number;
  baseline_cost: number;
  delta: number;
  timestamp: string;
}

import { PolicyRule, DEFAULT_RULES } from './policy.js';

export interface RouteConfig {
  activeRoute: string;
  activeMode: string;
}

interface DatabaseSchema {
  request_events: RequestEvent[];
  policy_hits: PolicyHit[];
  spend_records: SpendRecord[];
  repo_configs: RepoConfig[];
  policy_rules: PolicyRule[];
  feedback_records: FeedbackRecord[];
  tool_call_records: ToolCallRecord[];
  cache_spend_records: CacheSpendRecord[];
  active_route?: string;
  active_mode?: string;
}

/**
 * Reads database contents from local JSON file.
 */
export async function readDb(): Promise<DatabaseSchema> {
  let retries = 5;
  while (retries > 0) {
    try {
      const raw = await fs.promises.readFile(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        request_events: parsed.request_events || [],
        policy_hits: parsed.policy_hits || [],
        spend_records: parsed.spend_records || [],
        repo_configs: parsed.repo_configs || [],
        policy_rules: parsed.policy_rules || [],
        feedback_records: parsed.feedback_records || [],
        tool_call_records: parsed.tool_call_records || [],
        cache_spend_records: parsed.cache_spend_records || [],
        active_route: parsed.active_route,
        active_mode: parsed.active_mode
      };
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return { request_events: [], policy_hits: [], spend_records: [], repo_configs: [], policy_rules: [], feedback_records: [], tool_call_records: [], cache_spend_records: [] };
      }
      retries--;
      if (retries === 0) {
        console.error(`Failed to read local database file: ${e.message}, returning empty schema.`);
        return { request_events: [], policy_hits: [], spend_records: [], repo_configs: [], policy_rules: [], feedback_records: [], tool_call_records: [], cache_spend_records: [] };
      }
      // Wait 50ms before retrying to resolve lock conflict
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  return { request_events: [], policy_hits: [], spend_records: [], repo_configs: [], policy_rules: [], feedback_records: [], tool_call_records: [], cache_spend_records: [] };
}

/**
 * Writes database contents to local JSON file.
 */
async function writeDb(data: DatabaseSchema): Promise<void> {
  try {
    await fs.promises.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e: any) {
    console.error(`Failed to write local database file: ${e.message}`);
  }
}

/**
 * Initializes the database.
 */
export async function initDatabase(): Promise<void> {
  console.log(`Initializing JSON database at ${DB_FILE}...`);
  const db = await readDb();
  if (!db.policy_rules || db.policy_rules.length === 0) {
    db.policy_rules = DEFAULT_RULES.map(r => ({ ...r, hit_count: 0 }));
    db.tool_call_records = [];
    db.cache_spend_records = [];
    await writeDb(db);
  }
  console.log('JSON database successfully initialized.');
}

/**
 * Retrieve all active policy rules.
 */
export async function getPolicies(): Promise<PolicyRule[]> {
  return (await readDb()).policy_rules || [];
}

/**
 * Add or update a policy rule.
 */
export async function savePolicy(rule: PolicyRule): Promise<void> {
  const db = await readDb();
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
  await writeDb(db);
}

/**
 * Delete a policy rule.
 */
export async function deletePolicy(id: string): Promise<void> {
  const db = await readDb();
  if (db.policy_rules) {
    db.policy_rules = db.policy_rules.filter(r => r.id !== id);
  }
  await writeDb(db);
}

/**
 * Increment matching hit counter for a policy rule.
 */
export async function incrementPolicyHits(id: string): Promise<void> {
  const db = await readDb();
  if (db.policy_rules) {
    const rule = db.policy_rules.find(r => r.id === id);
    if (rule) {
      rule.hit_count = (rule.hit_count || 0) + 1;
      rule.last_matched_at = new Date().toISOString();
      await writeDb(db);
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
  const db = await readDb();
  const newEvent: RequestEvent = {
    id: uuidv4(),
    correlation_id: correlationId,
    timestamp: new Date().toISOString(),
    model,
    provider,
    status,
    latency_ms: latencyMs
  };
  db.request_events.push(newEvent);
  if (db.request_events.length > 5000) {
    db.request_events = db.request_events.slice(-5000);
  }
  await writeDb(db);
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
  const db = await readDb();
  const newHit: PolicyHit = {
    id: uuidv4(),
    correlation_id: correlationId,
    rule_id: ruleId,
    action,
    matched_value: matchedValue || null,
    timestamp: new Date().toISOString()
  };
  db.policy_hits.push(newHit);
  if (db.policy_hits.length > 5000) {
    db.policy_hits = db.policy_hits.slice(-5000);
  }
  await writeDb(db);
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
  const db = await readDb();
  const newSpend: SpendRecord = {
    id: uuidv4(),
    correlation_id: correlationId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    actual_cost: actualCost,
    baseline_cost: baselineCost,
    delta,
    timestamp: new Date().toISOString()
  };
  db.spend_records.push(newSpend);
  if (db.spend_records.length > 5000) {
    db.spend_records = db.spend_records.slice(-5000);
  }
  await writeDb(db);
}

/**
 * Get the current active model route configuration.
 */
export async function getRouteConfig(): Promise<RouteConfig> {
  const db = await readDb();
  return {
    activeRoute: db.active_route || 'aws-hosted/deepseek-coder-v2',
    activeMode: db.active_mode || 'manual'
  };
}

/**
 * Save the active route and mode configuration.
 */
export async function saveRouteConfig(config: Partial<RouteConfig>): Promise<void> {
  const db = await readDb();
  if (config.activeRoute !== undefined) {
    db.active_route = config.activeRoute;
  }
  if (config.activeMode !== undefined) {
    db.active_mode = config.activeMode;
  }
  await writeDb(db);
}

/**
 * Persist a feedback record for a completed request.
 * Replaces the previous read-modify-write on ccr_telemetry.json,
 * eliminating the concurrent-write race condition (#1).
 */
export async function logFeedback(
  correlationId: string,
  outcome: string,
  rating: string,
  comments: string
): Promise<void> {
  const db = await readDb();
  const record: FeedbackRecord = {
    id: uuidv4(),
    correlationId,
    outcome,
    rating,
    comments,
    timestamp: new Date().toISOString()
  };
  db.feedback_records.push(record);
  if (db.feedback_records.length > 5000) {
    db.feedback_records = db.feedback_records.slice(-5000);
  }
  await writeDb(db);
}

/**
 * Clears request events, policy hits, spend records, and feedback records.
 * Resets policy rules to default rules with 0 hit counts.
 */
export async function clearAllData(): Promise<void> {
  const db = await readDb();
  db.request_events = [];
  db.policy_hits = [];
  db.spend_records = [];
  db.feedback_records = [];
  db.tool_call_records = [];
  db.cache_spend_records = [];
  db.policy_rules = DEFAULT_RULES.map(r => ({ ...r, hit_count: 0 }));
  await writeDb(db);
}

/**
 * Log a tool call record for loop detection.
 */
export async function logToolCallRecord(record: ToolCallRecord): Promise<void> {
  const db = await readDb();
  if (!db.tool_call_records) {
    db.tool_call_records = [];
  }
  db.tool_call_records.push(record);
  if (db.tool_call_records.length > 10000) {
    db.tool_call_records = db.tool_call_records.slice(-10000);
  }
  await writeDb(db);
}

/**
 * Log a cache spend record for telemetry.
 */
export async function logCacheSpendRecord(
  correlationId: string,
  originalTokens: number,
  cachedTokens: number,
  actualCost: number,
  baselineCost: number,
  delta: number
): Promise<void> {
  const db = await readDb();
  if (!db.cache_spend_records) {
    db.cache_spend_records = [];
  }
  const newRecord: CacheSpendRecord = {
    id: uuidv4(),
    correlation_id: correlationId,
    original_tokens: originalTokens,
    cached_tokens: cachedTokens,
    actual_cost: actualCost,
    baseline_cost: baselineCost,
    delta,
    timestamp: new Date().toISOString()
  };
  db.cache_spend_records.push(newRecord);
  if (db.cache_spend_records.length > 5000) {
    db.cache_spend_records = db.cache_spend_records.slice(-5000);
  }
  await writeDb(db);
}

