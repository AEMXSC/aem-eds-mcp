/**
 * Workspace-Aware Prompt Context Optimization Module
 *
 * Caches repetitive file context on the gateway to reduce latency
 * and enable prompt caching headers for Anthropic/Bedrock.
 */

import { createHash } from 'crypto';

// Minimum content length to consider for caching
const MIN_CACHEABLE_LENGTH = 2000;

// Maximum cache entries (LRU eviction)
const MAX_CACHE_ENTRIES = 1000;

/**
 * Represents a cached context block
 */
export interface ContextBlock {
  hash: string;           // SHA-256 of content
  content: string;
  length: number;
  timestamp: number;
  cached: boolean;        // Whether cache_control was applied
  usageCount: number;     // How many times this block was used
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalBlocks: number;
  cachedBlocks: number;
  totalBytes: number;
  cachedBytes: number;
  estimatedSavings: number;  // In dollars
  hitRate: number;           // 0-1
}

/**
 * Cost configuration for savings calculation
 */
export interface CostConfig {
  inputTokenCost: number;      // Normal rate per 1k tokens
  cachedInputTokenCost: number; // Cached rate per 1k tokens
}

// Default costs (Anthropic Sonnet)
const DEFAULT_COSTS: CostConfig = {
  inputTokenCost: 0.000003,    // $3.00 / 1M tokens
  cachedInputTokenCost: 0.00000045  // $0.45 / 1M tokens
};

/**
 * In-memory context cache
 */
class ContextCache {
  public blocks: Map<string, ContextBlock> = new Map();
  private hits: Map<string, number> = new Map();
  private totalRequests = 0;

  /**
   * Check if content should be cached (length threshold)
   */
  shouldCache(content: string): boolean {
    return content.length >= MIN_CACHEABLE_LENGTH;
  }

  /**
   * Compute SHA-256 hash of content
   */
  computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get or create a cached block
   */
  getOrCreateBlock(content: string): ContextBlock | null {
    if (!this.shouldCache(content)) {
      return null;
    }

    const hash = this.computeHash(content);
    const existing = this.blocks.get(hash);

    if (existing) {
      // Update timestamp and usage
      existing.timestamp = Date.now();
      existing.usageCount++;
      this.hits.set(hash, (this.hits.get(hash) || 0) + 1);
      return existing;
    }

    // Create new block
    const block: ContextBlock = {
      hash,
      content,
      length: content.length,
      timestamp: Date.now(),
      cached: false,
      usageCount: 1
    };

    // Evict if at capacity (simple LRU)
    if (this.blocks.size >= MAX_CACHE_ENTRIES) {
      this.evictOldest();
    }

    this.blocks.set(hash, block);
    return block;
  }

  /**
   * Evict least recently used blocks
   */
  private evictOldest(): void {
    let oldestTime = Infinity;
    let oldestHash: string | null = null;

    for (const [hash, block] of this.blocks) {
      if (block.timestamp < oldestTime) {
        oldestTime = block.timestamp;
        oldestHash = hash;
      }
    }

    if (oldestHash) {
      this.blocks.delete(oldestHash);
      this.hits.delete(oldestHash);
    }
  }

  /**
   * Mark a block as cached (cache_control applied)
   */
  markAsCached(hash: string): void {
    const block = this.blocks.get(hash);
    if (block) {
      block.cached = true;
    }
  }

  /**
   * Calculate savings from cached tokens
   */
  calculateSavings(costs: CostConfig = DEFAULT_COSTS): { cachedTokens: number; savings: number } {
    let cachedTokens = 0;

    for (const block of this.blocks.values()) {
      if (block.cached) {
        cachedTokens += block.length / 3.8;  // Approximate chars per token
      }
    }

    // Calculate savings: (normal_rate - cached_rate) * tokens
    const savingsPerToken = costs.inputTokenCost - costs.cachedInputTokenCost;
    const savings = cachedTokens * savingsPerToken / 1000;  // Per 1k tokens

    return { cachedTokens, savings };
  }

  /**
   * Get cache statistics
   */
  getStats(costs: CostConfig = DEFAULT_COSTS): CacheStats {
    let totalBlocks = 0;
    let cachedBlocks = 0;
    let totalBytes = 0;
    let cachedBytes = 0;

    for (const block of this.blocks.values()) {
      totalBlocks++;
      totalBytes += block.length;

      if (block.cached) {
        cachedBlocks++;
        cachedBytes += block.length;
      }
    }

    // Calculate hit rate
    let totalHits = 0;
    for (const count of this.hits.values()) {
      totalHits += count;
    }

    const hitRate = this.totalRequests > 0 ? totalHits / this.totalRequests : 0;

    const { savings } = this.calculateSavings(costs);

    return {
      totalBlocks,
      cachedBlocks,
      totalBytes,
      cachedBytes,
      estimatedSavings: savings,
      hitRate
    };
  }

  /**
   * Increment request counter
   */
  recordRequest(): void {
    this.totalRequests++;
  }

  /**
   * Clear all cached blocks
   */
  clear(): void {
    this.blocks.clear();
    this.hits.clear();
    this.totalRequests = 0;
  }
}

// Global singleton cache
const globalCache = new ContextCache();

/**
 * Tool content block for message processing
 */
interface CacheToolContentBlock {
  type: string;
  text?: string;
  content?: string | { type: string; text?: string }[];
}

/**
 * Message object for cacheable content extraction
 */
interface CacheableMessage {
  content?: string | CacheToolContentBlock[];
}

/**
 * Parse message content and extract cacheable blocks
 */
export function extractCacheableBlocks(messages: CacheableMessage[]): { hash: string; content: string; length: number }[] {
  const blocks: { hash: string; content: string; length: number }[] = [];

  if (!messages) return blocks;

  for (const msg of messages) {
    let content = '';

    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          content += block.text + '\n';
        } else if (block.type === 'tool_result' && typeof block.content === 'string') {
          content += block.content + '\n';
        } else if (block.type === 'tool_result' && Array.isArray(block.content)) {
          for (const inner of block.content) {
            if (inner.type === 'text' && typeof inner.text === 'string') {
              content += inner.text + '\n';
            }
          }
        }
      }
    }

    if (content.length >= MIN_CACHEABLE_LENGTH) {
      blocks.push({
        hash: globalCache.computeHash(content),
        content,
        length: content.length
      });
    }
  }

  return blocks;
}

/**
 * Cache a file context block
 */
export function cacheFileContext(filePath: string, content: string): ContextBlock | null {
  return globalCache.getOrCreateBlock(content);
}

interface CacheControlObject {
  cache_control?: unknown;
  [key: string]: unknown;
}

function hasCacheControl(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (hasCacheControl(item)) return true;
    }
  } else {
    const typedObj = obj as CacheControlObject;
    if (typedObj.cache_control) return true;
    for (const key of Object.keys(typedObj)) {
      if (hasCacheControl(typedObj[key])) return true;
    }
  }
  return false;
}

/**
 * Apply cache headers to Anthropic message body
 *
 * For Anthropic, we add "cache_control": {"type": "ephemeral"}
 * to the end of system prompts and largest context blocks.
 */
export function injectCacheHeaders(
  body: any,
  costs: CostConfig = DEFAULT_COSTS
): { modified: boolean; savings: number } {
  if (!body?.messages) {
    return { modified: false, savings: 0 };
  }

  // If the request already has cache control headers, let the client manage its own caching.
  if (hasCacheControl(body)) {
    return { modified: false, savings: 0 };
  }

  let modified = false;
  let totalSavings = 0;

  // Find the largest text block to cache
  let largestBlockIndex = -1;
  let largestLength = 0;

  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    let contentLength = 0;

    if (typeof msg.content === 'string') {
      contentLength = msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          contentLength += block.text.length;
        }
      }
    }

    if (contentLength > largestLength) {
      largestLength = contentLength;
      largestBlockIndex = i;
    }
  }

  // Cache the largest block (typically user prompt with workspace context)
  if (largestBlockIndex >= 0) {
    const msg = body.messages[largestBlockIndex];

    if (Array.isArray(msg.content)) {
      // Find the last text block to add cache_control
      for (let i = msg.content.length - 1; i >= 0; i--) {
        const block = msg.content[i];
        if (block.type === 'text' && typeof block.text === 'string') {
          // Check if we should cache this block
          if (block.text.length >= MIN_CACHEABLE_LENGTH) {
            // Add cache_control to this block
            // For Anthropic, we add it as a property on the block
            (block as any).cache_control = { type: 'ephemeral' };
            modified = true;

            // Estimate savings
            const tokens = block.text.length / 3.8;
            const savingsPerToken = costs.inputTokenCost - costs.cachedInputTokenCost;
            totalSavings = tokens * savingsPerToken / 1000;

            // Track in cache
            globalCache.getOrCreateBlock(block.text);
            globalCache.markAsCached(globalCache.computeHash(block.text));
          }
          break; // Only cache one block per message
        }
      }
    }
  }

  return { modified, savings: totalSavings };
}

/**
 * Apply cache headers to system prompt
 */
export function cacheSystemPrompt(
  systemPrompt: string | undefined
): { prompt: string | undefined; cached: boolean } {
  if (!systemPrompt || systemPrompt.length < MIN_CACHEABLE_LENGTH) {
    return { prompt: systemPrompt, cached: false };
  }

  // Cache the system prompt
  globalCache.getOrCreateBlock(systemPrompt);

  return { prompt: systemPrompt, cached: true };
}

/**
 * Get current cache statistics
 */
export function getCacheStats(): CacheStats {
  return globalCache.getStats();
}

/**
 * Record a request for hit rate calculation
 */
export function recordCacheRequest(): void {
  globalCache.recordRequest();
}

/**
 * Clear the entire cache
 */
export function clearCache(): void {
  globalCache.clear();
}

/**
 * Export the cache for debugging/monitoring
 */
export function exportCache(): Map<string, ContextBlock> {
  return new Map(globalCache.blocks);
}
