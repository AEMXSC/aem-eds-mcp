export interface ModelRegistryEntry {
  id: string;
  name: string;
  provider: string;
  hosting: 'aws-hosted' | 'bedrock' | 'mantle' | 'internal' | 'developer-local' | 'anthropic';
  cost: string;
  supportedModes: string[];
  policyTags: string[];
  availabilityStatus: 'online' | 'offline';
  aws_region: string;
  health: 'healthy' | 'unhealthy';
  /** Bedrock Mantle model identifier — only set for hosting === 'mantle'. */
  mantleModelId?: string;
  /** Native Bedrock model ARN/ID — only set for hosting === 'bedrock'. */
  bedrockModelId?: string;
  /** Custom fallback model ID (e.g. cloud fallback for unhealthy local models). */
  fallbackModelId?: string;
  /** If true, shown in the IDE ⭐ Top Picks section for this user's workload. */
  recommended?: boolean;
  /** When true, route through the native Bedrock SDK client instead of Mantle HTTP API. */
  useBedrockNative?: boolean;
}

export const UNIFIED_MODEL_REGISTRY: ModelRegistryEntry[] = [

  // ── EKS self-hosted OSS ──────────────────────────────────────────────────────
  {
    id: 'aws-hosted/qwen-coder-32b',
    name: 'Fast Code (AWS)',
    provider: 'alibaba',
    hosting: 'aws-hosted',
    cost: '$0.00018 / 1k tokens (Est. Savings: 85%)',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['low-cost', 'code-only', 'oss'],
    availabilityStatus: 'online',
    aws_region: 'us-west-2',
    health: 'healthy',
    fallbackModelId: 'mantle/qwen3-coder-next',
  },
  {
    id: 'aws-hosted/deepseek-coder-v2',
    name: 'Balanced Code (AWS)',
    provider: 'deepseek',
    hosting: 'aws-hosted',
    cost: '$0.00014 / 1k tokens (Est. Savings: 90%)',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['low-cost', 'code-only', 'oss'],
    availabilityStatus: 'online',
    aws_region: 'us-west-2',
    health: 'healthy',
    fallbackModelId: 'mantle/deepseek-v3.2',
    recommended: true, // #2: Best latency for quick TS/Node edits, EKS-hosted
  },
  {
    id: 'aws-hosted/glm-coder-v2',
    name: 'Experimental Code (AWS)',
    provider: 'glm',
    hosting: 'aws-hosted',
    cost: '$0.00020 / 1k tokens (Est. Savings: 80%)',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['challenger', 'oss'],
    availabilityStatus: 'online',
    aws_region: 'us-west-2',
    health: 'healthy',
    fallbackModelId: 'mantle/deepseek-v3.2',
  },

  // ── Native Anthropic — subscription passthrough (api.anthropic.com) ──────────
  // These routes forward the original request to api.anthropic.com using the
  // client's own credentials. Billed against the subscription — $0 marginal cost.
  // The 'model' field in the request body is preserved, so Claude Code controls
  // which Claude model runs (Sonnet, Opus, Haiku, etc.).
  {
    id: 'anthropic/native',
    name: 'Claude (Subscription)',
    provider: 'anthropic',
    hosting: 'anthropic',
    cost: '$0.00 marginal (subscription quota)',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['frontier', 'high-reasoning', 'subscription'],
    availabilityStatus: 'online',
    aws_region: 'n/a',
    health: 'healthy',
    recommended: true, // #5: Complex architecture, debugging sessions needing full Claude
  },

  // ── Bedrock native SDK (PrivateLink) ─────────────────────────────────────────
  {
    id: 'bedrock/claude-3-5-sonnet',
    name: 'Claude Sonnet (Bedrock)',
    provider: 'anthropic',
    hosting: 'bedrock',
    cost: '$0.00300 / 1k tokens (Premium PrivateLink)',
    supportedModes: ['manual', 'suggested'],
    policyTags: ['frontier', 'high-reasoning'],
    availabilityStatus: 'online',
    aws_region: 'us-east-1',
    health: 'healthy',
    bedrockModelId: 'us.anthropic.claude-sonnet-4-6',
  },
  {
    id: 'bedrock/claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6 (Bedrock)',
    provider: 'anthropic',
    hosting: 'bedrock',
    cost: '$0.00300 / 1k tokens (PrivateLink)',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['frontier', 'high-reasoning'],
    availabilityStatus: 'online',
    aws_region: 'us-east-1',
    health: 'healthy',
    bedrockModelId: 'us.anthropic.claude-sonnet-4-6',
  },

  // ── Bedrock Mantle — Anthropic (Messages API /anthropic/v1/messages) ─────────
  // Anthropic models require separate CCR project access approval via AWS Sales.
  // Set availabilityStatus: 'online' once enabled in the Mantle console.
  {
    id: 'mantle/claude-opus-4-8',
    name: 'Claude Opus 4.8 (Mantle)',
    provider: 'anthropic',
    hosting: 'mantle',
    cost: '$0.01500 / 1k tokens',
    supportedModes: ['manual', 'suggested'],
    policyTags: ['frontier', 'high-reasoning', 'mantle'],
    availabilityStatus: 'offline',
    aws_region: 'us-east-1',
    health: 'unhealthy',
    mantleModelId: 'anthropic.claude-opus-4-8',
  },
  {
    id: 'mantle/claude-opus-4-7',
    name: 'Claude Opus 4.7 (Mantle)',
    provider: 'anthropic',
    hosting: 'mantle',
    cost: '$0.01500 / 1k tokens',
    supportedModes: ['manual', 'suggested'],
    policyTags: ['frontier', 'high-reasoning', 'mantle'],
    availabilityStatus: 'offline',
    aws_region: 'us-east-1',
    health: 'unhealthy',
    mantleModelId: 'anthropic.claude-opus-4-7',
  },
  {
    id: 'mantle/claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6 (Mantle)',
    provider: 'anthropic',
    hosting: 'mantle',
    cost: '$0.00300 / 1k tokens',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['frontier', 'mantle'],
    // Mantle's /v1/models does not list Claude Sonnet — use bedrock/claude-sonnet-4-6 instead.
    availabilityStatus: 'offline',
    aws_region: 'us-east-1',
    health: 'unhealthy',
    mantleModelId: 'anthropic.claude-sonnet-4-6',
    useBedrockNative: true,
  },
  {
    id: 'mantle/claude-haiku-4-5',
    name: 'Claude Haiku 4.5 (Mantle)',
    provider: 'anthropic',
    hosting: 'mantle',
    cost: '$0.00080 / 1k tokens',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['low-cost', 'mantle'],
    availabilityStatus: 'online',
    aws_region: 'us-east-1',
    health: 'healthy',
    mantleModelId: 'anthropic.claude-haiku-4-5',
  },

  // ── Bedrock Mantle — OSS (Chat Completions API /v1/chat/completions) ─────────
  {
    id: 'mantle/grok-4.3',
    name: 'Grok 4.3 (Mantle)',
    provider: 'xai',
    hosting: 'mantle',
    cost: '$0.00300 / 1k tokens (Est.)',
    supportedModes: ['manual', 'suggested'],
    policyTags: ['frontier', 'high-reasoning', 'oss', 'mantle'],
    availabilityStatus: 'offline',
    aws_region: 'us-east-1',
    health: 'unhealthy',
    mantleModelId: 'xai.grok-4.3',
  },
  {
    id: 'mantle/qwen3-coder-480b',
    name: 'Qwen3 Coder 480B (Mantle)',
    provider: 'alibaba',
    hosting: 'mantle',
    cost: '$0.00020 / 1k tokens (Est.)',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['frontier', 'code-only', 'oss', 'mantle'],
    availabilityStatus: 'online',
    aws_region: 'us-east-1',
    health: 'healthy',
    mantleModelId: 'qwen.qwen3-coder-480b-a35b-instruct',
  },
  {
    id: 'mantle/devstral-2-123b',
    name: 'Devstral 2 123B (Mantle)',
    provider: 'mistral',
    hosting: 'mantle',
    cost: '$0.00015 / 1k tokens (Est.)',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['code-only', 'oss', 'mantle'],
    availabilityStatus: 'online',
    aws_region: 'us-east-1',
    health: 'healthy',
    mantleModelId: 'mistral.devstral-2-123b',
    recommended: true, // #3: Mistral code model — strong on TS/JS refactors & AEM blocks
  },
  {
    id: 'mantle/kimi-k2-thinking',
    name: 'Kimi K2 Thinking (Mantle)',
    provider: 'moonshotai',
    hosting: 'mantle',
    cost: '$0.00200 / 1k tokens (Est.)',
    supportedModes: ['manual', 'suggested'],
    policyTags: ['high-reasoning', 'oss', 'mantle'],
    availabilityStatus: 'online',
    aws_region: 'us-east-1',
    health: 'healthy',
    mantleModelId: 'moonshotai.kimi-k2-thinking',
    recommended: true, // #5 OSS: Reasoning-heavy tasks (debugging, architecture) — 33% cheaper than Claude
  },
  {
    id: 'mantle/mistral-large-3-675b',
    name: 'Mistral Large 3 675B (Mantle)',
    provider: 'mistral',
    hosting: 'mantle',
    cost: '$0.00400 / 1k tokens (Est.)',
    supportedModes: ['manual', 'suggested'],
    policyTags: ['frontier', 'high-reasoning', 'oss', 'mantle'],
    availabilityStatus: 'online',
    aws_region: 'us-east-1',
    health: 'healthy',
    mantleModelId: 'mistral.mistral-large-3-675b-instruct',
  },
  {
    id: 'mantle/gpt-5.5',
    name: 'GPT-5.5 (Mantle)',
    provider: 'openai',
    hosting: 'mantle',
    cost: '$0.00500 / 1k tokens',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['frontier', 'oss', 'mantle'],
    availabilityStatus: 'offline',
    aws_region: 'us-east-1',
    health: 'unhealthy',
    mantleModelId: 'openai.gpt-5.5',
  },
  {
    id: 'mantle/gpt-oss-20b',
    name: 'GPT OSS 20B (Mini)',
    provider: 'openai',
    hosting: 'mantle',
    cost: '$0.00100 / 1k tokens (Est.)',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['low-cost', 'high-reasoning', 'oss', 'mantle'],
    availabilityStatus: 'online',
    aws_region: 'us-east-1',
    health: 'healthy',
    mantleModelId: 'openai.gpt-oss-20b',
  },
  {
    id: 'mantle/gpt-oss-120b',
    name: 'GPT OSS 120B (Large)',
    provider: 'openai',
    hosting: 'mantle',
    cost: '$0.00300 / 1k tokens (Est.)',
    supportedModes: ['manual', 'suggested'],
    policyTags: ['frontier', 'high-reasoning', 'oss', 'mantle'],
    availabilityStatus: 'online',
    aws_region: 'us-east-1',
    health: 'healthy',
    mantleModelId: 'openai.gpt-oss-120b',
  },
  {
    id: 'mantle/qwen3-coder-next',
    name: 'Qwen3 Coder (Mantle)',
    provider: 'alibaba',
    hosting: 'mantle',
    cost: '$0.00008 / 1k tokens (Est. Savings: 97%)',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['low-cost', 'code-only', 'oss', 'mantle'],
    availabilityStatus: 'online',
    aws_region: 'us-east-1',
    health: 'healthy',
    mantleModelId: 'qwen.qwen3-coder-next',
    recommended: true, // #1: Cheapest coding model, 97% savings — ideal for TS/AEM/EDS iteration
  },
  {
    id: 'mantle/deepseek-v3.2',
    name: 'DeepSeek V3.2 (Mantle)',
    provider: 'deepseek',
    hosting: 'mantle',
    cost: '$0.00010 / 1k tokens (Est. Savings: 97%)',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['low-cost', 'code-only', 'oss', 'mantle'],
    availabilityStatus: 'online',
    aws_region: 'us-east-1',
    health: 'healthy',
    mantleModelId: 'deepseek.v3.2',
    recommended: true, // #4: Best cost/quality balance — proven fallback, excellent at reasoning
  },

  // ── Internal / VPN ───────────────────────────────────────────────────────────
  {
    id: 'internal/adobe-codex-v2',
    name: 'Internal Secure Route',
    provider: 'internal',
    hosting: 'internal',
    cost: '$0.00 (Enterprise VPN Licensed)',
    supportedModes: ['manual', 'suggested', 'auto'],
    policyTags: ['internal', 'secure'],
    availabilityStatus: 'online',
    aws_region: 'local-vpc',
    health: 'healthy',
  },
];
