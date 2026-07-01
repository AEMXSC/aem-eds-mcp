import * as fs from 'fs';
import * as path from 'path';

// 'route' is distinct from 'warn': it allows the request but overrides the routing destination.
export type PolicyMode = 'monitor' | 'warn' | 'enforce' | 'route';
export type PolicyType = 'file_path' | 'regex_pattern' | 'ccrignore';
export type PolicyScope = 'repo' | 'global';

export interface PolicyRule {
  id: string;
  name: string;
  mode: PolicyMode;
  type: 'file_path' | 'regex_pattern' | 'ccrignore';
  pattern: string;
  description: string;
  scope?: string;
  hit_count?: number;
  last_matched_at?: string;
  forcedRoute?: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  action: 'allow' | 'warn' | 'block';
  triggeredRules: string[];
  warnings: string[];
  blockedReason?: string;
  modifiedBody?: any;
  forcedRoute?: string;
}

// Keyword list is a constant so operators can audit it without reading method bodies.
const DEFAULT_CONFIDENTIAL_DIR_KEYWORDS = ['secure', 'confidential', 'private'] as const;

// Default static rules for the prototype
export const DEFAULT_RULES: readonly PolicyRule[] = Object.freeze([
  {
    id: 'rule-env',
    name: 'Block Env Files',
    mode: 'enforce',
    type: 'file_path',
    pattern: '\\.env(\\..*)?$',
    description: 'Bans reading of environment configuration files containing sensitive keys'
  },
  {
    id: 'rule-pem',
    name: 'Block Private Keys',
    mode: 'enforce',
    type: 'file_path',
    pattern: '\\.pem$|id_rsa',
    description: 'Bans reading of private SSH / TLS keys'
  },
  {
    id: 'rule-conf-forced-local',
    name: 'Force Low-Egress for Configuration Files',
    // 'route' mode: allows the request but overrides routing to low-egress model.
    mode: 'route',
    type: 'file_path',
    pattern: '\\.conf$|config\\.json$',
    description: 'Forces configuration file reads to utilize low-egress managed AWS routes',
    forcedRoute: 'aws-hosted/qwen-coder-32b'
  },
  {
    id: 'rule-secrets',
    name: 'Detect API Keys',
    mode: 'warn',
    type: 'regex_pattern',
    pattern: 'sk-ant-api03-[A-Za-z0-9_\\-]{80,}|AIzaSy[A-Za-z0-9_\\-]{33}',
    description: 'Scans for raw Anthropic API keys or Google Cloud API keys in prompts'
  }
]);

export interface PolicyEngineConfig {
  /**
   * When false, the workspace directory name heuristic (secure/confidential/private)
   * is skipped. Set CCR_DISABLE_WORKSPACE_POLICY=true in environment to disable.
   */
  workspacePolicyEnabled?: boolean;
  /**
   * Override the directory name keywords that trigger forced-local routing.
   */
  confidentialDirKeywords?: readonly string[];
}

export class PolicyEngine {
  private readonly rules: readonly PolicyRule[];
  private readonly workspacePolicyEnabled: boolean;
  private readonly confidentialDirKeywords: readonly string[];

  constructor(config: PolicyEngineConfig = {}) {
    this.rules = DEFAULT_RULES;
    this.workspacePolicyEnabled = config.workspacePolicyEnabled ?? true;
    this.confidentialDirKeywords = config.confidentialDirKeywords ?? DEFAULT_CONFIDENTIAL_DIR_KEYWORDS;
  }

  /**
   * At startup, warn if any default rule's forcedRoute is absent from the
   * provided model registry. Prevents silent misrouting on ID typos or renames.
   */
  public validateForcedRoutes(validRouteIds: Set<string>): void {
    for (const rule of DEFAULT_RULES) {
      if (rule.forcedRoute && !validRouteIds.has(rule.forcedRoute)) {
        console.error(
          `[ccr] Policy rule "${rule.id}" has forcedRoute "${rule.forcedRoute}" ` +
          `which is not in the model registry. Forced routing for this rule will be ignored.`
        );
      }
    }
  }

  /**
   * Evaluates an incoming Claude Code request body against configured policies.
   */
  public evaluateRequest(body: any, repoPath?: string, activeRules?: PolicyRule[]): PolicyEvaluationResult {
    const result: PolicyEvaluationResult = {
      allowed: true,
      action: 'allow',
      triggeredRules: [],
      warnings: [],
      modifiedBody: body
    };

    if (!body || !body.messages) {
      return result;
    }

    const messages = body.messages as Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;

    if (repoPath) {
      const ccrIgnorePatterns = this.loadCcrIgnore(repoPath);
      if (ccrIgnorePatterns.length > 0) {
        const ignoreResult = this.checkCcrIgnore(messages, ccrIgnorePatterns);
        if (!ignoreResult.allowed) {
          result.allowed = false;
          result.action = 'block';
          result.triggeredRules.push('ccrignore-violation');
          result.blockedReason = `Access denied by repository .ccrignore rules: ${ignoreResult.matchedPath}`;
          return result;
        }
      }

      if (this.workspacePolicyEnabled) {
        const repoDirName = path.basename(repoPath).toLowerCase();
        
        // Premium security overrides
        const premiumKeywords = ['payment', 'auth', 'finance', 'billing'];
        const matchedPremium = premiumKeywords.find(kw => repoDirName.includes(kw));
        
        if (matchedPremium) {
          result.forcedRoute = 'bedrock/claude-3-5-sonnet';
          result.triggeredRules.push('sensitive-workspace-forced-premium');
          result.action = 'warn';
          result.warnings.push(
            `Sensitive workspace root detected ("${repoDirName}" matches keyword "${matchedPremium}"). ` +
            `Routing forced to premium Bedrock route. Set CCR_DISABLE_WORKSPACE_POLICY=true to opt out.`
          );
        } else {
          // Default confidentiality overrides
          const matchedKeyword = this.confidentialDirKeywords.find(kw => repoDirName.includes(kw));
          if (matchedKeyword) {
            result.forcedRoute = 'aws-hosted/qwen-coder-32b';
            result.triggeredRules.push('workspace-forced-local');
            result.action = 'warn';
            result.warnings.push(
              `Confidential workspace root detected ("${repoDirName}" matches keyword "${matchedKeyword}"). ` +
              `Routing forced to low-egress managed AWS route. Set CCR_DISABLE_WORKSPACE_POLICY=true to opt out.`
            );
          }
        }
      }
    }

    const rulesToUse = activeRules || this.rules;

    for (const rule of rulesToUse) {
      if (rule.type === 'file_path') {
        const pathViolation = this.checkFilePathViolation(messages, rule.pattern);
        if (pathViolation) {
          this.applyRuleAction(
            rule,
            result,
            `Access to sensitive path blocked: ${pathViolation} [Matched Rule: ${rule.name}]. ` +
            `If this file is required, configure a local .ccrignore rule or contact security administration.`
          );
          if (!result.allowed) return result;
        }
      } else if (rule.type === 'regex_pattern') {
        const textContent = this.extractAllText(messages);
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(textContent)) {
            this.applyRuleAction(
              rule,
              result,
              `Detected sensitive pattern matching rule: ${rule.name}. ` +
              `Please ensure no credentials or secrets are transmitted in prompt texts.`
            );
            if (!result.allowed) return result;
          }
        } catch (e: any) {
          console.error(`Skipping invalid regex policy rule [${rule.id}]: ${e.message}`);
        }
      }
    }

    return result;
  }

  private applyRuleAction(rule: PolicyRule, result: PolicyEvaluationResult, message: string) {
    result.triggeredRules.push(rule.id);
    if (rule.forcedRoute) {
      result.forcedRoute = rule.forcedRoute;
    }
    if (rule.mode === 'enforce') {
      result.allowed = false;
      result.action = 'block';
      result.blockedReason = message;
    } else if (rule.mode === 'warn') {
      result.action = 'warn';
      result.warnings.push(message);
    } else if (rule.mode === 'route') {
      // Route mode: allow the request, but flag a warning so the operator knows routing was overridden.
      // Does not change result.allowed — the request proceeds.
      if (result.action !== 'block') result.action = 'warn';
      result.warnings.push(message);
    }
    // 'monitor' mode: record trigger only, no action taken.
  }

  private extractAllText(messages: any[]): string {
    let combinedText = '';
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        combinedText += msg.content + '\n';
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            combinedText += block.text + '\n';
          } else if (block.type === 'tool_result') {
            if (typeof block.content === 'string') {
              combinedText += block.content + '\n';
            } else if (Array.isArray(block.content)) {
              for (const inner of block.content) {
                if (inner.type === 'text' && typeof inner.text === 'string') {
                  combinedText += inner.text + '\n';
                }
              }
            }
          }
        }
      }
    }
    return combinedText;
  }

  private checkFilePathViolation(messages: any[], pattern: string): string | null {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch (e: any) {
      console.error(`Skipping invalid path regex rule for pattern "${pattern}": ${e.message}`);
      return null;
    }

    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            const input = block.input || {};
            const pathsToTest = [
              input.path,
              input.file_path,
              input.filepath,
              input.file,
              input.notebook_path,
              input.command
            ].map(p => typeof p === 'string' ? p.replace(/\\/g, '/') : p);
            for (const p of pathsToTest) {
              if (typeof p === 'string' && regex.test(p)) return p;
            }
          }
          if (block.type === 'tool_result') {
            if (typeof block.output === 'string' && regex.test(block.output)) {
              return 'tool_output';
            }
          }
        }
      }
    }
    return null;
  }

  private loadCcrIgnore(repoPath: string): string[] {
    const ignoreFilePath = path.join(repoPath, '.ccrignore');
    if (!fs.existsSync(ignoreFilePath)) return [];
    try {
      const content = fs.readFileSync(ignoreFilePath, 'utf8');
      return content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    } catch {
      return [];
    }
  }

  private checkCcrIgnore(messages: any[], patterns: string[]): { allowed: boolean; matchedPath?: string } {
    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            const input = block.input || {};
            let filePath = input.path || input.file_path || input.filepath || input.file || input.notebook_path;
            if (typeof filePath === 'string') {
              filePath = filePath.replace(/\\/g, '/');
              for (const pattern of patterns) {
                let regexMatch = false;
                try {
                  regexMatch = new RegExp(pattern).test(filePath);
                } catch {
                  // invalid regex in .ccrignore — fall through to string includes
                }
                if (filePath.includes(pattern) || regexMatch) {
                  return { allowed: false, matchedPath: filePath };
                }
              }
            }
          }
        }
      }
    }
    return { allowed: true };
  }

  /**
   * Scans a command string against known destructive shell patterns.
   */
  public isCommandDangerous(command: string): { dangerous: boolean; reason?: string } {
    const blockedPatterns = [
      { regex: /rm\s+-rf\s+([*./]|\$[A-Z_]+)/i, reason: 'Destructive recursive deletion' },
      { regex: /chmod\s+-[rwx]*777/i, reason: 'Insecure wide-open permission grant' },
      { regex: /(curl|wget)\s+.*\|\s*(bash|sh|zsh)/i, reason: 'Raw internet script piping/execution' },
      { regex: /dd\s+if=.*of=\/dev\/(sd|nvme|hd)/i, reason: 'Raw disk block overwrite write operation' },
      { regex: /mkfs\.[a-z0-9]+/i, reason: 'Filesystem formatting operation' },
      { regex: /:(){ :|:& };:/, reason: 'Fork bomb resource exhaustion attack' }
    ];

    for (const p of blockedPatterns) {
      if (p.regex.test(command)) {
        return { dangerous: true, reason: p.reason };
      }
    }
    return { dangerous: false };
  }

  /**
   * Scans an outgoing non-streaming model response for dangerous shell execution tool calls.
   */
  public evaluateModelResponse(responseBody: any): { allowed: boolean; blockedReason?: string } {
    if (!responseBody) return { allowed: true };

    const content = responseBody.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use' && (block.name === 'run_command' || block.name === 'bash' || block.name === 'execute_command')) {
          const command = block.input?.command;
          if (typeof command === 'string') {
            const check = this.isCommandDangerous(command);
            if (check.dangerous) {
              return { allowed: false, blockedReason: check.reason };
            }
          }
        }
      }
    }
    return { allowed: true };
  }
}
