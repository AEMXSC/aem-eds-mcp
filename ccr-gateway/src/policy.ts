import * as fs from 'fs';
import * as path from 'path';

export type PolicyMode = 'monitor' | 'warn' | 'enforce';

export interface PolicyRule {
  id: string;
  name: string;
  mode: PolicyMode;
  type: 'file_path' | 'regex_pattern' | 'ccrignore';
  pattern: string; // regex pattern or file path glob
  description: string;
  scope?: string;
  hit_count?: number;
  last_matched_at?: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  action: 'allow' | 'warn' | 'block';
  triggeredRules: string[];
  warnings: string[];
  blockedReason?: string;
  modifiedBody?: any;
}

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
    id: 'rule-secrets',
    name: 'Detect API Keys',
    mode: 'warn',
    type: 'regex_pattern',
    pattern: 'sk-ant-api03-[A-Za-z0-9_\\-]{80,}|AIzaSy[A-Za-z0-9_\\-]{33}',
    description: 'Scans for raw Anthropic API keys or Google Cloud API keys in prompts'
  }
]);

export class PolicyEngine {
  private rules: readonly PolicyRule[];

  constructor() {
    this.rules = DEFAULT_RULES;
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

    const messages = body.messages as any[];

    // 1. Evaluate .ccrignore constraints if repo path is available
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
    }

    const rulesToUse = activeRules || this.rules;

    // 2. Evaluate active policy rules
    for (const rule of rulesToUse) {
      if (rule.type === 'file_path') {
        const pathViolation = this.checkFilePathViolation(messages, rule.pattern);
        if (pathViolation) {
          this.applyRuleAction(
            rule,
            result,
            `Access to sensitive path blocked: ${pathViolation} [Matched Rule: ${rule.name}]. If this file is required, configure a local .ccrignore rule or contact security administration.`
          );
          if (!result.allowed) {
            return result;
          }
        }
      } else if (rule.type === 'regex_pattern') {
        const textContent = this.extractAllText(messages);
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(textContent)) {
            this.applyRuleAction(
              rule,
              result,
              `Detected sensitive pattern matching rule: ${rule.name}. Please ensure no credentials or secrets are transmitted in prompt texts.`
            );
            if (!result.allowed) {
              return result;
            }
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
    if (rule.mode === 'enforce') {
      result.allowed = false;
      result.action = 'block';
      result.blockedReason = message;
    } else if (rule.mode === 'warn') {
      result.action = 'warn';
      result.warnings.push(message);
    }
  }

  /**
   * Helper: Extracts all textual content from the messages payload (including prompts and tool outputs).
   */
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

  /**
   * Helper: Inspects tool uses and results to see if the agent is trying to access prohibited file paths.
   */
  private checkFilePathViolation(messages: any[], pattern: string): string | null {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch (e: any) {
      console.error(`Skipping invalid path regex rule for pattern "${pattern}": ${e.message}`);
      return null;
    }

    for (const msg of messages) {
      // Check tool calls (assistant requesting to read/write a path)
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            // Check tool inputs (e.g. filepath, path, file, or command parameters)
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
              if (typeof p === 'string' && regex.test(p)) {
                return p;
              }
            }
          }
          if (block.type === 'tool_result') {
            // Check if tool result identifier or name matches the pattern
            if (typeof block.output === 'string' && regex.test(block.output)) {
              return 'tool_output';
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Helper: Loads .ccrignore file patterns from the local repo path.
   */
  private loadCcrIgnore(repoPath: string): string[] {
    const ignoreFilePath = path.join(repoPath, '.ccrignore');
    if (!fs.existsSync(ignoreFilePath)) {
      return [];
    }
    try {
      const content = fs.readFileSync(ignoreFilePath, 'utf8');
      return content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    } catch (e) {
      return [];
    }
  }

  /**
   * Helper: Checks if any file access in the messages violates the .ccrignore patterns.
   */
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
              } catch (_e) {
                // invalid regex pattern in .ccrignore — skip regex test, rely on includes()
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
}
