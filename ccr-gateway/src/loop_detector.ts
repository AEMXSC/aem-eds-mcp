/**
 * Agentic Loop Protection Module
 *
 * Detects and prevents infinite loops in Claude Code agent sessions.
 * Uses a sliding-window ring buffer to track tool calls per session.
 */

import { createHash } from 'crypto';

// Maximum entries in the sliding window per session
const MAX_WINDOW_SIZE = 10;

// Detection thresholds
const TERMINAL_LOOP_THRESHOLD = 4;   // Same command + failure ≥4 times
const EDIT_PINGPONG_THRESHOLD = 3;   // Same file edited back-and-forth ≥3 times
const STATELESS_REPETITION_THRESHOLD = 3;  // Identical prompt ≥3 times

// Threshold for considering edit content "similar" (Jaccard similarity)
const EDIT_SIMILARITY_THRESHOLD = 0.6;

// Maximum age of entries to consider (in seconds)
const MAX_ENTRY_AGE_SECONDS = 60;

/**
 * Represents a single tool call event in the session history
 */
export interface ToolCallRecord {
  id: string;
  session_id: string;
  timestamp: number;
  tool_name: string;
  args_hash: string;
  args_normalized?: string;
  tool_result_status?: 'success' | 'failure';
  file_path?: string;           // For edit tool tracking
  line_range?: string;          // For edit ping-pong detection
  prompt_snapshot?: string;     // For stateless repetition detection
}

/**
 * Normalized tool call for comparison
 */
export interface NormalizedToolCall {
  tool_name: string;
  args_hash: string;
  file_path?: string;
  line_range?: string;
  is_failure: boolean;
  args_normalized?: string;
}

/**
 * Loop detection result
 */
export interface LoopDetectionResult {
  isLoop: boolean;
  loopType: 'terminal' | 'pingpong' | 'stateless' | null;
  confidence: number;  // 0-1
  details: {
    consecutiveCount: number;
    threshold: number;
    toolName?: string;
    filePath?: string;
    explanation: string;
  };
}

/**
 * Session state for loop detection
 */
export interface SessionState {
  session_id: string;
  records: ToolCallRecord[];
  lastPromptHash?: string;
  promptRepeatCount: number;
}

/**
 * Compute SHA-256 hash of a string
 */
export function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Tool arguments interface
 */
interface ToolArgs {
  command?: string;
  path?: string;
  file_path?: string;
  filepath?: string;
  file?: string;
  line_range?: string;
  start_line?: number;
  end_line?: number;
  [key: string]: unknown;
}

/**
 * Normalize tool arguments for comparison
 */
export function normalizeToolArgs(tool_name: string, args: ToolArgs | null | undefined): string {
  if (!args) return '';

  // For run_command, ignore timing-related or session-specific fields
  if (tool_name === 'run_command') {
    return JSON.stringify({ command: args.command });
  }

  // For edit tool, normalize path and focus on content structure
  if (tool_name === 'edit' || tool_name === 'edit_file') {
    return JSON.stringify({
      path: args.path || args.file_path,
      line_range: args.line_range || (args.start_line !== undefined && args.end_line !== undefined) ? `${args.start_line}-${args.end_line}` : undefined
    });
  }

  // Default: serialize all args
  return JSON.stringify(args, Object.keys(args).sort());
}

/**
 * Tool content block for message processing
 */
interface ToolContentBlock {
  type: string;
  name?: string;
  input?: ToolArgs;
  content?: string | { type: string; text?: string }[];
  text?: string;
}

/**
 * Message object for Anthropic API
 */
interface AnthropicMessage {
  role?: string;
  content?: string | ToolContentBlock[];
}

/**
 * Extract tool calls from Anthropic message body
 */
export function extractToolCalls(body: { messages?: AnthropicMessage[] }): NormalizedToolCall[] {
  const calls: NormalizedToolCall[] = [];

  if (!body?.messages) return calls;

  for (const msg of body.messages) {
    let contentArray: ToolContentBlock[] | undefined;

    if (typeof msg.content === 'string') {
      continue; // Skip string-only messages
    } else if (Array.isArray(msg.content)) {
      contentArray = msg.content;
    }

    if (!contentArray) continue;

    for (const block of contentArray) {
      if (block.type === 'tool_use') {
        const tool_name = block.name || '';
        const args = block.input || {};
        const argsHash = hashString(normalizeToolArgs(tool_name, args));

        calls.push({
          tool_name,
          args_hash: argsHash,
          args_normalized: normalizeToolArgs(tool_name, args),
          file_path: args.path || args.file_path || args.filepath || args.file,
          line_range: getLineRange(args),
          is_failure: false  // We don't know result status yet
        });
      }
    }
  }

  return calls;
}

/**
 * Extract line range from edit tool arguments
 */
function getLineRange(args: ToolArgs | undefined): string | undefined {
  if (!args) return undefined;
  if (args.line_range) return args.line_range;
  if (args.start_line !== undefined && args.end_line !== undefined) {
    return `${args.start_line}-${args.end_line}`;
  }
  return undefined;
}

/**
 * Sliding window ring buffer for session tool calls
 */
class SessionRingBuffer {
  private buffers: Map<string, ToolCallRecord[]> = new Map();
  private promptCounts: Map<string, number> = new Map();
  private lastPrompts: Map<string, string> = new Map();
  private lastPromptTimes: Map<string, number> = new Map();

  /**
   * Add a tool call record to the buffer
   */
  addRecord(record: ToolCallRecord): void {
    let buffer = this.buffers.get(record.session_id);
    if (!buffer) {
      buffer = [];
      this.buffers.set(record.session_id, buffer);
    }

    buffer.push(record);

    // Trim to MAX_WINDOW_SIZE
    if (buffer.length > MAX_WINDOW_SIZE) {
      buffer.shift();
    }
  }

  /**
   * Get records for a session within the time window
   */
  getRecords(sessionId: string): ToolCallRecord[] {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) return [];

    const now = Date.now();
    const maxAgeMs = MAX_ENTRY_AGE_SECONDS * 1000;

    return buffer.filter(r => (now - r.timestamp) < maxAgeMs);
  }

  /**
   * Check for terminal loop (same command + failure)
   */
  checkTerminalLoop(sessionId: string, currentTool: NormalizedToolCall): LoopDetectionResult | null {
    const records = this.getRecords(sessionId);

    // Filter to only the current tool with failures
    const matchingFailures = records.filter(r =>
      r.tool_name === currentTool.tool_name &&
      r.args_hash === currentTool.args_hash &&
      r.tool_result_status === 'failure'
    );

    const count = matchingFailures.length;

    if (count >= TERMINAL_LOOP_THRESHOLD) {
      return {
        isLoop: true,
        loopType: 'terminal',
        confidence: Math.min(1.0, count / TERMINAL_LOOP_THRESHOLD),
        details: {
          consecutiveCount: count,
          threshold: TERMINAL_LOOP_THRESHOLD,
          toolName: currentTool.tool_name,
          explanation: `Same failing command "${currentTool.tool_name}" executed ${count} times consecutively`
        }
      };
    }

    return null;
  }

  /**
   * Check for edit ping-pong (same file edited back-and-forth)
   */
  checkEditPingPong(sessionId: string, currentTool: NormalizedToolCall): LoopDetectionResult | null {
    const records = this.getRecords(sessionId);

    if (!currentTool.file_path) return null;

    // Filter to edits on the same file
    const fileEdits = records.filter(r =>
      r.tool_name === 'edit' || r.tool_name === 'edit_file' ||
      r.tool_name === 'write_file' || r.tool_name === 'append_to_file'
    ).filter(r => {
      const rPath = r.file_path || '';
      const cPath = currentTool.file_path || '';
      return rPath === cPath;
    });

    if (fileEdits.length >= EDIT_PINGPONG_THRESHOLD) {
      return {
        isLoop: true,
        loopType: 'pingpong',
        confidence: Math.min(1.0, fileEdits.length / EDIT_PINGPONG_THRESHOLD),
        details: {
          consecutiveCount: fileEdits.length,
          threshold: EDIT_PINGPONG_THRESHOLD,
          filePath: currentTool.file_path,
          explanation: `Same file "${currentTool.file_path}" edited ${fileEdits.length} times in quick succession`
        }
      };
    }

    return null;
  }

  /**
   * Check for stateless repetition (identical prompt without workspace changes)
   */
  checkStatelessRepetition(sessionId: string, promptSnapshot: string): LoopDetectionResult | null {
    const currentHash = hashString(promptSnapshot);
    const lastHash = this.lastPrompts.get(sessionId);
    const lastTime = this.lastPromptTimes.get(sessionId);
    const now = Date.now();

    if (lastHash && currentHash === lastHash) {
      if (lastTime && (now - lastTime) > MAX_ENTRY_AGE_SECONDS * 1000) {
        this.promptCounts.set(sessionId, 1);
        this.lastPromptTimes.set(sessionId, now);
        return null;
      }

      const count = (this.promptCounts.get(sessionId) || 0) + 1;
      this.promptCounts.set(sessionId, count);
      this.lastPromptTimes.set(sessionId, now);

      if (count >= STATELESS_REPETITION_THRESHOLD) {
        return {
          isLoop: true,
          loopType: 'stateless',
          confidence: Math.min(1.0, count / STATELESS_REPETITION_THRESHOLD),
          details: {
            consecutiveCount: count,
            threshold: STATELESS_REPETITION_THRESHOLD,
            explanation: `Identical prompt payload sent ${count} times without workspace changes`
          }
        };
      }
    } else {
      this.promptCounts.set(sessionId, 1);
      this.lastPrompts.set(sessionId, currentHash);
      this.lastPromptTimes.set(sessionId, now);
    }

    return null;
  }

  /**
   * Clear old records for a session
   */
  cleanup(sessionId: string): void {
    const buffer = this.buffers.get(sessionId);
    if (buffer) {
      const now = Date.now();
      const maxAgeMs = MAX_ENTRY_AGE_SECONDS * 1000;
      const filtered = buffer.filter(r => (now - r.timestamp) < maxAgeMs);
      this.buffers.set(sessionId, filtered);
    }
  }

  /**
   * Clear all buffers
   */
  clear(): void {
    this.buffers.clear();
    this.promptCounts.clear();
    this.lastPrompts.clear();
    this.lastPromptTimes.clear();
  }

  /**
   * Clear records for a specific session
   */
  clearSession(sessionId: string): void {
    this.buffers.delete(sessionId);
  }

  /**
   * Update the result status of a specific tool call
   */
  updateToolResult(sessionId: string, toolUseId: string, status: 'success' | 'failure'): void {
    const buffer = this.buffers.get(sessionId);
    if (buffer) {
      const record = buffer.find(r => r.id === toolUseId);
      if (record) {
        record.tool_result_status = status;
      }
    }
  }

  /**
   * Get loop detection statistics (public accessor)
   */
  getStats(): {
    activeSessions: number;
    totalRecords: number;
  } {
    let totalRecords = 0;
    let activeSessions = 0;

    for (const [, buffer] of this.buffers) {
      if (buffer.length > 0) {
        activeSessions++;
        totalRecords += buffer.length;
      }
    }

    return { activeSessions, totalRecords };
  }
}

// Global singleton ring buffer
const globalRingBuffer = new SessionRingBuffer();

/**
 * Main loop detection function - checks all three loop types
 */
export function detectLoop(
  sessionId: string,
  currentTool: NormalizedToolCall,
  promptSnapshot: string = ''
): LoopDetectionResult | null {
  // Check terminal loop first (most critical)
  const terminalLoop = globalRingBuffer.checkTerminalLoop(sessionId, currentTool);
  if (terminalLoop?.isLoop) return terminalLoop;

  // Check edit ping-pong
  const pingpongLoop = globalRingBuffer.checkEditPingPong(sessionId, currentTool);
  if (pingpongLoop?.isLoop) return pingpongLoop;

  // Check stateless repetition (only if prompt provided)
  if (promptSnapshot) {
    const statelessLoop = globalRingBuffer.checkStatelessRepetition(sessionId, promptSnapshot);
    if (statelessLoop?.isLoop) return statelessLoop;
  }

  return null;
}

/**
 * Record a tool call in the ring buffer
 */
export function recordToolCall(sessionId: string, record: ToolCallRecord): void {
  globalRingBuffer.addRecord(record);
}

/**
 * Record a tool result (success/failure)
 */
export function recordToolResult(
  sessionId: string,
  toolName: string,
  args: ToolArgs | null | undefined,
  status: 'success' | 'failure'
): void {
  const argsHash = hashString(normalizeToolArgs(toolName, args));
  const normalized = normalizeToolArgs(toolName, args);

  const record: ToolCallRecord = {
    id: `tool-${Date.now()}`,
    session_id: sessionId,
    timestamp: Date.now(),
    tool_name: toolName,
    args_hash: argsHash,
    args_normalized: normalized,
    tool_result_status: status
  };

  globalRingBuffer.addRecord(record);
}

/**
 * Record an edit tool call
 */
export function recordEditTool(
  sessionId: string,
  filePath: string,
  lineRange?: string
): void {
  const record: ToolCallRecord = {
    id: `edit-${Date.now()}`,
    session_id: sessionId,
    timestamp: Date.now(),
    tool_name: 'edit',
    args_hash: hashString(filePath + (lineRange || '')),
    file_path: filePath,
    line_range: lineRange
  };

  globalRingBuffer.addRecord(record);
}

/**
 * Record prompt for stateless repetition detection
 */
export function recordPrompt(sessionId: string, promptSnapshot: string): void {
  globalRingBuffer.checkStatelessRepetition(sessionId, promptSnapshot);
}

/**
 * Cleanup old records for a session
 */
export function cleanupSession(sessionId: string): void {
  globalRingBuffer.cleanup(sessionId);
}

/**
 * Clear all session data (for testing or admin reset)
 */
export function clearAllSessions(): void {
  globalRingBuffer.clear();
}

/**
 * Clear a specific session's tool records
 */
export function clearSession(sessionId: string): void {
  globalRingBuffer.clearSession(sessionId);
}

/**
 * Update a specific tool use ID's status in the session
 */
export function updateToolResult(sessionId: string, toolUseId: string, status: 'success' | 'failure'): void {
  globalRingBuffer.updateToolResult(sessionId, toolUseId, status);
}

/**
 * Get loop detection statistics
 */
export function getLoopStats(): {
  activeSessions: number;
  totalRecords: number;
} {
  return globalRingBuffer.getStats();
}
