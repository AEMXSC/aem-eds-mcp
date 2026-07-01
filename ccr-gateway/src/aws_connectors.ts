import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { request } from 'undici';
import * as dotenv from 'dotenv';
import { FastifyReply } from 'fastify';
import { PolicyEngine } from './policy.js';

dotenv.config();

const policyEngine = new PolicyEngine();



// ── Request body types ────────────────────────────────────────────────────────

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | ContentBlock[];
}

export interface AnthropicMessage {
  role?: string;
  content?: string | ContentBlock[];
}

export interface AnthropicRequestBody {
  model?:          string;
  messages?:       AnthropicMessage[];
  system?:         string;
  max_tokens?:     number;
  temperature?:    number;
  top_p?:          number;
  top_k?:          number;
  stop_sequences?: string[];
  stream?:         boolean;
  tools?:          unknown[];
  tool_choice?:    unknown;
}

interface OpenAIToolCall {
  id:       string;
  type:     'function';
  function: { name: string; arguments: string };
}

interface OpenAIMessage {
  role:          string;
  content:       string | null;
  tool_calls?:   OpenAIToolCall[];
  tool_call_id?: string;
}

const log = {
  error: (msg: string, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(JSON.stringify({ level: 'error', msg, error: message, time: Date.now() }) + '\n');
  },
};

const AWS_REGION = process.env.AWS_REGION || 'us-west-2';
const BEDROCK_ENDPOINT = process.env.BEDROCK_ENDPOINT; // AWS PrivateLink VPC interface endpoint
const VLLM_ENDPOINT = process.env.VLLM_ENDPOINT || 'http://localhost:8000'; // EKS-hosted vLLM endpoint

let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: AWS_REGION,
      credentials: fromNodeProviderChain(),
      ...(BEDROCK_ENDPOINT ? { endpoint: BEDROCK_ENDPOINT } : {})
    });
  }
  return bedrockClient;
}

const MANTLE_BASE        = process.env.BEDROCK_MANTLE_BASE_URL || 'https://bedrock-mantle.us-east-1.api.aws';
const BEDROCK_MANTLE_URL = `${MANTLE_BASE}/anthropic`;
const AWS_BEARER_TOKEN_BEDROCK = process.env.AWS_BEARER_TOKEN_BEDROCK;

/**
 * Interface with Amazon Bedrock Claude Runtime or Bedrock Mantle Gateway
 */
export async function invokeBedrockModel(
  modelId: string,
  reqBody: AnthropicRequestBody,
  explicitBedrockModelId?: string
): Promise<{ statusCode: number; body: string }> {
  // Native AWS Bedrock Runtime Client (PrivateLink).
  // Mantle routing is handled by the dedicated mantle/ branch in server.ts.
  const client = getBedrockClient();

  // Prefer explicit registry-provided model ID; fall back to legacy heuristic.
  const bedrockModelId = explicitBedrockModelId || (
    modelId.includes('claude-3-5-sonnet')
      ? 'us.anthropic.claude-sonnet-4-6'
      : 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
  );

  const bedrockPayload: any = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: reqBody.max_tokens || 1024,
    messages: reqBody.messages,
    system: reqBody.system,
    temperature: reqBody.temperature,
    top_p: reqBody.top_p,
    top_k: reqBody.top_k,
    stop_sequences: reqBody.stop_sequences
  };

  if (reqBody.tools) bedrockPayload.tools = reqBody.tools;
  if (reqBody.tool_choice) bedrockPayload.tool_choice = reqBody.tool_choice;

  try {
    const command = new InvokeModelCommand({
      modelId: bedrockModelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(bedrockPayload)
    });

    const response = await client.send(command);
    const textDecoder = new TextDecoder('utf-8');
    const responseBody = textDecoder.decode(response.body);

    return {
      statusCode: 200,
      body: responseBody
    };
  } catch (err: any) {
    log.error('AWS Bedrock invocation error', err);
    return {
      statusCode: err.$metadata?.httpStatusCode || 500,
      body: JSON.stringify({
        error: {
          type: 'api_error',
          message: `Amazon Bedrock Runtime error: ${err.message}`
        }
      })
    };
  }
}

/**
 * Helper to compile Anthropic's text blocks and decode base64 document blocks
 * into a single unified plain text content string for OpenAI compatibility.
 */
export function compileMessageContent(blocks: ContentBlock[]): string {
  let compiledText = '';
  for (const block of blocks) {
    if (block.type === 'text') {
      compiledText += (block.text || '') + '\n';
    } else if (block.type === 'document') {
      const docBlock = block as any;
      if (docBlock.source && docBlock.source.type === 'base64') {
        const title = docBlock.title || 'document';
        try {
          const decoded = Buffer.from(docBlock.source.data, 'base64').toString('utf8');
          compiledText += `\n[Uploaded File: ${title}]\n---\n${decoded}\n---\n`;
        } catch (err) {
          compiledText += `\n[Uploaded File: ${title} (failed to decode base64 content)]\n`;
        }
      }
    } else if (block.type === 'image') {
      const imgBlock = block as any;
      if (imgBlock.source && imgBlock.source.type === 'base64') {
        const mediaType = imgBlock.source.media_type || 'image/jpeg';
        compiledText += `\n[Uploaded Image: type=${mediaType}, data_length=${imgBlock.source.data.length} bytes]\n`;
      }
    }
  }
  return compiledText.trim();
}

/**
 * Translate Anthropic message structures to OpenAI/vLLM structures
 */
export function translateAnthropicToOpenAI(reqBody: AnthropicRequestBody, modelName: string): {
  model: string; messages: OpenAIMessage[]; max_tokens: number; temperature: number; stream: boolean;
} {
  const messages = reqBody.messages || [];
  const openAIMessages: OpenAIMessage[] = [];

  for (const m of messages) {
    if (typeof m.content === 'string') {
      openAIMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
      continue;
    }

    const blocks = Array.isArray(m.content) ? m.content : [];
    const toolUseBlocks   = blocks.filter(c => c.type === 'tool_use');
    const toolResultBlocks = blocks.filter(c => c.type === 'tool_result');

    if (toolUseBlocks.length > 0) {
      // Assistant message with tool calls
      openAIMessages.push({
        role: 'assistant',
        content: compileMessageContent(blocks) || null,
        tool_calls: toolUseBlocks.map(c => ({
          id:       sanitizeToolUseId(c.id || ''),
          type:     'function' as const,
          function: { name: c.name || '', arguments: JSON.stringify(c.input ?? {}) },
        })),
      });
    } else if (toolResultBlocks.length > 0) {
      // One OpenAI tool message per tool_result block
      for (const block of toolResultBlocks) {
        const resultContent = typeof block.content === 'string'
          ? block.content
          : Array.isArray(block.content)
            ? compileMessageContent(block.content as ContentBlock[])
            : '';
        openAIMessages.push({ role: 'tool', content: resultContent, tool_call_id: sanitizeToolUseId(block.tool_use_id || '') });
      }
      // Check if there are other blocks (text or document) to be sent as user message
      const compiledUserContent = compileMessageContent(blocks.filter(c => c.type !== 'tool_result'));
      if (compiledUserContent) {
        openAIMessages.push({ role: 'user', content: compiledUserContent });
      }
    } else {
      openAIMessages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: compileMessageContent(blocks),
      });
    }
  }

  if (reqBody.system) {
    openAIMessages.unshift({ role: 'system', content: reqBody.system });
  }

  return {
    model:       modelName,
    messages:    openAIMessages,
    max_tokens:  reqBody.max_tokens || 1024,
    temperature: reqBody.temperature || 0.7,
    stream:      reqBody.stream || false,
    // Forward tool definitions so OSS models (DeepSeek, Qwen3, Devstral, etc.) know what tools are available.
    ...(reqBody.tools       ? { tools: (reqBody.tools as Array<{ name?: string; description?: string; input_schema?: unknown; parameters?: unknown }>).map(t => ({
      type: 'function',
      function: {
        name:        t.name ?? '',
        description: t.description ?? '',
        parameters:  t.input_schema ?? t.parameters ?? {},
      },
    })) } : {}),
    ...(reqBody.tool_choice ? { tool_choice: reqBody.tool_choice } : {}),
  };
}

/**
 * Proxy request to the EKS-hosted vLLM inference endpoint
 */
export async function invokeVllmModel(
  modelId: string,
  reqBody: AnthropicRequestBody
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const baseModel = modelId.split('/')[1] || 'qwen-coder-32b';

  // EKS-hosted vLLM endpoint. Mantle OSS routing is handled by invokeMantleOssModel.
  const openAIPayload = translateAnthropicToOpenAI(reqBody, baseModel);

  try {
    const res = await request(`${VLLM_ENDPOINT}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(openAIPayload),
      headersTimeout: 90000, // 90s — EKS cold-start + large outputs
      bodyTimeout:    120000,
    });

    const bodyText = await res.body.text();
    const contentType = (res.headers['content-type'] as string) || 'application/json';

    return {
      statusCode: res.statusCode,
      headers: { 'content-type': contentType },
      body: bodyText
    };
  } catch (err: any) {
    log.error('EKS vLLM connection error', err);
    return {
      statusCode: 503,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: {
          type: 'api_error',
          message: `EKS hosted OSS model is unreachable: ${err.message}`
        }
      })
    };
  }
}

/**
 * Anthropic-format models via Bedrock Mantle Messages API.
 * Takes the exact Mantle model ID (e.g. 'anthropic.claude-fable-5').
 */
export async function invokeMantleAnthropicModel(
  mantleModelId: string,
  reqBody: AnthropicRequestBody
): Promise<{ statusCode: number; body: string }> {
  if (!AWS_BEARER_TOKEN_BEDROCK) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: { type: 'api_error', message: 'AWS_BEARER_TOKEN_BEDROCK is not configured.' } }),
    };
  }
  const payload: any = {
    model: mantleModelId,
    max_tokens: reqBody.max_tokens || 1024,
    messages: reqBody.messages,
    system: reqBody.system,
    temperature: reqBody.temperature,
    top_p: reqBody.top_p,
    stop_sequences: reqBody.stop_sequences,
    stream: reqBody.stream || false,
  };
  if (reqBody.tools) payload.tools = reqBody.tools;
  if (reqBody.tool_choice) payload.tool_choice = reqBody.tool_choice;
  try {
    const res = await request(`${BEDROCK_MANTLE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': AWS_BEARER_TOKEN_BEDROCK,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
      headersTimeout: 30000,
    });
    return { statusCode: res.statusCode, body: await res.body.text() };
  } catch (err: any) {
    log.error('Mantle Anthropic API error', err);
    return {
      statusCode: 503,
      body: JSON.stringify({ error: { type: 'api_error', message: `Bedrock Mantle error: ${err.message}` } }),
    };
  }
}

/**
 * Stream Anthropic-format models via Bedrock Mantle Messages API.
 */
export async function streamMantleAnthropicToClient(
  mantleModelId: string,
  reqBody: AnthropicRequestBody,
  reply: FastifyReply
): Promise<{ statusCode: number }> {
  if (!AWS_BEARER_TOKEN_BEDROCK) {
    reply.status(503).send({ error: { type: 'api_error', message: 'AWS_BEARER_TOKEN_BEDROCK is not configured.' } });
    return { statusCode: 503 };
  }
  const payload: any = {
    model: mantleModelId,
    max_tokens: reqBody.max_tokens || 1024,
    messages: reqBody.messages,
    system: reqBody.system,
    temperature: reqBody.temperature,
    top_p: reqBody.top_p,
    stop_sequences: reqBody.stop_sequences,
    stream: true,
  };
  if (reqBody.tools) payload.tools = reqBody.tools;
  if (reqBody.tool_choice) payload.tool_choice = reqBody.tool_choice;
  try {
    const res = await request(`${BEDROCK_MANTLE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': AWS_BEARER_TOKEN_BEDROCK,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
      headersTimeout: 90000,
      bodyTimeout:    120000,
    });

    if (res.statusCode !== 200) {
      let errBody = '';
      try { errBody = await res.body.text(); } catch { errBody = '(unreadable)'; }
      reply.header('content-type', 'application/json');
      let parsedErr = { error: { type: 'api_error', message: `Mantle Anthropic ${res.statusCode}: ${errBody}` } };
      try { parsedErr = JSON.parse(errBody); } catch {}
      reply.status(res.statusCode).send(parsedErr);
      return { statusCode: res.statusCode };
    }

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    });

    for await (const chunk of res.body) {
      raw.write(chunk);
    }
    return { statusCode: 200 };
  } catch (err: any) {
    log.error('Mantle Anthropic streaming error', err);
    reply.status(503).send({ error: { type: 'api_error', message: `Bedrock Mantle error: ${err.message}` } });
    return { statusCode: 503 };
  }
}


/**
 * OSS / third-party models via Bedrock Mantle Chat Completions API.
 * Takes the exact Mantle model ID (e.g. 'qwen.qwen3-coder-next').
 * Response is in OpenAI format — caller must translate back to Anthropic.
 */
export async function invokeMantleOssModel(
  mantleModelId: string,
  reqBody: AnthropicRequestBody
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  if (!AWS_BEARER_TOKEN_BEDROCK) {
    return {
      statusCode: 503,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { type: 'api_error', message: 'AWS_BEARER_TOKEN_BEDROCK is not configured.' } }),
    };
  }
  const mantleBaseUrl = MANTLE_BASE;
  const openAIPayload = translateAnthropicToOpenAI(reqBody, mantleModelId);
  try {
    const res = await request(`${mantleBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AWS_BEARER_TOKEN_BEDROCK}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(openAIPayload),
      headersTimeout: 120000, // 2 min — large generations (landing pages, complex code) take time to start
      bodyTimeout:    180000, // 3 min — allow full response body for long outputs
    });
    const bodyText = await res.body.text();
    const contentType = (res.headers['content-type'] as string) || 'application/json';

    // Log empty responses for debugging
    if (!bodyText || bodyText.trim().length === 0) {
      log.error('Mantle OSS returned empty response body', { mantleModelId, statusCode: res.statusCode });
    }

    return { statusCode: res.statusCode, headers: { 'content-type': contentType }, body: bodyText };
  } catch (err: any) {
    log.error('Mantle OSS model error', err);
    return {
      statusCode: 503,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { type: 'api_error', message: `Bedrock Mantle OSS error: ${err.message}` } }),
    };
  }
}

/**
 * Stream OSS model response from Bedrock Mantle with real-time
 * OpenAI SSE → Anthropic SSE translation, chunk by chunk.
 *
 * Best practices applied (LiteLLM / Portkey / OpenAI proxy patterns):
 *  • No buffering — each data chunk is translated and emitted immediately
 *  • Stable tool_use_id across multi-chunk tool calls (LiteLLM gotcha fix)
 *  • input_json_delta events for streaming tool arguments
 *  • Periodic 10-second ping events to hold long-lived connections open
 *  • stream_options.include_usage extracts token counts from final chunk
 *  • Error SSE event emitted on upstream failure so clients can handle it
 */
export async function streamOpenAiCompletionsToAnthropic(
  endpointUrl: string,
  authHeaderValue: string | null,
  modelId: string,
  reqBody: AnthropicRequestBody,
  reply: FastifyReply,
): Promise<{ statusCode: number; inputTokens: number; outputTokens: number }> {

  // Build OpenAI payload — always stream, request usage in final chunk.
  const openAIPayload = {
    ...translateAnthropicToOpenAI(reqBody, modelId),
    stream: true,
    stream_options: { include_usage: true }, // Many OSS models honour this (ignored if not supported)
  };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (authHeaderValue) {
    headers['Authorization'] = authHeaderValue;
  }

  let res: any;
  try {
    res = await request(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(openAIPayload),
      headersTimeout: 30_000,   // Streaming headers arrive fast — keep tight
      bodyTimeout:    300_000,  // 5 min for full generation stream
    });
  } catch (err: any) {
    reply.status(503).send({ error: { type: 'api_error', message: `OSS endpoint connection error: ${err.message}` } });
    return { statusCode: 503, inputTokens: 0, outputTokens: 0 };
  }

  if (res.statusCode !== 200) {
    let errBody = '';
    try { errBody = await res.body.text(); } catch { errBody = '(unreadable)'; }
    reply.header('content-type', 'application/json');
    let parsedErr = { error: { type: 'api_error', message: `OSS endpoint error ${res.statusCode}: ${errBody}` } };
    try { parsedErr = JSON.parse(errBody); } catch {}
    reply.status(res.statusCode).send(parsedErr);
    return { statusCode: res.statusCode, inputTokens: 0, outputTokens: 0 };
  }

  // Upstream request succeeded. Flush HTTP 200 OK headers now.
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'connection':    'keep-alive',
  });

  // Estimate input tokens based on request messages character length
  let estimatedInputTokens = 0;
  if (reqBody.messages) {
    let charCount = 0;
    for (const msg of reqBody.messages) {
      if (typeof msg.content === 'string') {
        charCount += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text' && typeof block.text === 'string') charCount += block.text.length;
        }
      }
    }
    estimatedInputTokens = Math.ceil(charCount / 3.8);
  }

  // ── SSE state ────────────────────────────────────────────────────────────────
  const msgId        = `msg_${Math.random().toString(36).substring(2, 26)}`;
  let inputTokens    = 0;
  let outputTokens   = 0;
  let accumulatedOutputChars = 0;
  let blockIndex     = 0;      // Sequential content block counter
  let textBlockOpen  = false;
  let textBlockIdx   = -1;

  // Tool call accumulation: OpenAI sends tool args across multiple chunks.
  // Key = OpenAI tool_calls[].index, Value = block metadata.
  const toolStates = new Map<number, { id: string; name: string; blockIndex: number; args: string }>();

  // Extract command value from partial JSON arguments stream
  const tryExtractCommand = (rawArgs: string): string | null => {
    try {
      let jsonToTry = rawArgs.trim();
      if (!jsonToTry.endsWith('}')) {
        if (!jsonToTry.endsWith('"')) {
          jsonToTry += '"';
        }
        jsonToTry += '}';
      }
      const parsed = JSON.parse(jsonToTry);
      return parsed.command || parsed.cmd || null;
    } catch {
      const match = rawArgs.match(/"(?:command|cmd)"\s*:\s*"([^"]*)"?/);
      return match ? match[1] : null;
    }
  };

  // Emit helper — always ends with the required \n\n separator.
  const emit = (event: string, data: unknown) =>
    raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // ── Open the Anthropic message ───────────────────────────────────────────────
  emit('message_start', {
    type: 'message_start',
    message: {
      id: msgId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: modelId,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  });

  // Periodically send ping events to keep connection alive
  const pingTimer = setInterval(() => {
    emit('ping', { type: 'ping' });
  }, 10000);

  try {
    let lineBuffer = '';
    let firstChunkChecked = false;

    for await (const rawChunk of res.body) {
      const chunkStr = Buffer.isBuffer(rawChunk) ? rawChunk.toString('utf8') : String(rawChunk);

      if (!firstChunkChecked) {
        firstChunkChecked = true;
        const trimmedChunk = chunkStr.trim();
        if (trimmedChunk.startsWith('{')) {
          // Upstream returned a raw JSON error payload instead of an event-stream!
          let parsedErr: any;
          try { parsedErr = JSON.parse(trimmedChunk); } catch {}
          if (parsedErr?.error) {
            emit('error', {
              type: 'error',
              error: {
                type: 'api_error',
                message: `Upstream Capacity/Service Error: ${parsedErr.error.message || JSON.stringify(parsedErr.error)}`
              }
            });
            clearInterval(pingTimer);
            return { statusCode: 503, inputTokens: 0, outputTokens: 0 };
          }
        }
      }

      lineBuffer += chunkStr;
      const lines = lineBuffer.split('\n');
      lineBuffer  = lines.pop() ?? ''; // Keep any incomplete trailing line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue; // Handled via finish_reason below

        let chunk: any;
        try { chunk = JSON.parse(dataStr); } catch { continue; } // Skip malformed lines

        if (chunk.error) {
          emit('error', {
            type: 'error',
            error: {
              type: chunk.error.type || 'invalid_request_error',
              message: chunk.error.message || 'Stream error from upstream'
            }
          });
          clearInterval(pingTimer);
          return { statusCode: 400, inputTokens: 0, outputTokens: 0 };
        }

        // Usage can appear in the final chunk (when stream_options.include_usage=true).
        if (chunk.usage) {
          inputTokens  = chunk.usage.prompt_tokens    || inputTokens;
          outputTokens = chunk.usage.completion_tokens || outputTokens;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta        = choice.delta;
        const finishReason = choice.finish_reason;

        // ── Text content delta ─────────────────────────────────────────────────
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          accumulatedOutputChars += delta.content.length;
          if (!textBlockOpen) {
            textBlockIdx = blockIndex++;
            emit('content_block_start', {
              type: 'content_block_start', index: textBlockIdx,
              content_block: { type: 'text', text: '' },
            });
            textBlockOpen = true;
          }
          emit('content_block_delta', {
            type: 'content_block_delta', index: textBlockIdx,
            delta: { type: 'text_delta', text: delta.content },
          });
        }

        // ── Tool use / call delta ──────────────────────────────────────────────
        if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
          if (textBlockOpen) {
            emit('content_block_stop', { type: 'content_block_stop', index: textBlockIdx });
            textBlockOpen = false;
          }

          for (const tc of delta.tool_calls) {
            const index = tc.index ?? 0;
            let state = toolStates.get(index);

            // First chunk of a tool call details the ID and function name
            if (tc.id && tc.function?.name) {
              const blkIdx = blockIndex++;
              const sanitizedId = sanitizeToolUseId(tc.id);
              state = {
                id:         sanitizedId,
                name:       tc.function.name,
                blockIndex: blkIdx,
                args:       tc.function.arguments || '',
              };
              toolStates.set(index, state);

              emit('content_block_start', {
                type: 'content_block_start', index: blkIdx,
                content_block: { type: 'tool_use', id: sanitizedId, name: tc.function.name, input: {} },
              });
            }

            // Subsequent chunks contain partial JSON arguments strings
            if (tc.function?.arguments && state) {
              state.args += tc.function.arguments;

              // ── Dangerous command interception ──
              if (state.name === 'run_command' || state.name === 'bash' || state.name === 'execute_command') {
                const cmd = tryExtractCommand(state.args);
                if (cmd) {
                  const check = policyEngine.isCommandDangerous(cmd);
                  if (check.dangerous) {
                    emit('error', {
                      type: 'error',
                      error: {
                        type: 'security_violation',
                        message: `Command blocked by enterprise security policy: ${check.reason}`
                      }
                    });
                    throw new Error(`Security Violation: Blocked dangerous command stream: "${cmd}" (${check.reason})`);
                  }
                }
              }

              emit('content_block_delta', {
                type: 'content_block_delta', index: state.blockIndex,
                delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
              });
            }
          }
        }

        // ── Finish reason — close blocks and end the message ───────────────────
        if (finishReason) {
          if (textBlockOpen) {
            emit('content_block_stop', { type: 'content_block_stop', index: textBlockIdx });
            textBlockOpen = false;
          }
          for (const [, state] of toolStates) {
            emit('content_block_stop', { type: 'content_block_stop', index: state.blockIndex });
          }
          toolStates.clear();

          const stopReason = finishReason === 'tool_calls' ? 'tool_use'
                           : finishReason === 'length'     ? 'max_tokens'
                           : 'end_turn';

          emit('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: { output_tokens: outputTokens },
          });
          emit('message_stop', { type: 'message_stop' });
        }
      }
    }
  } finally {
    clearInterval(pingTimer);
  }

  if (inputTokens === 0) inputTokens = estimatedInputTokens;
  if (outputTokens === 0) outputTokens = Math.ceil(accumulatedOutputChars / 3.8);

  return { statusCode: 200, inputTokens, outputTokens };
}

/**
 * Thin wrapper for streaming Mantle OSS models.
 */
export async function streamMantleOssToAnthropic(
  mantleModelId: string,
  reqBody: AnthropicRequestBody,
  reply: FastifyReply,
): Promise<{ statusCode: number; inputTokens: number; outputTokens: number }> {
  if (!AWS_BEARER_TOKEN_BEDROCK) {
    reply.status(503).send({ error: { type: 'api_error', message: 'AWS_BEARER_TOKEN_BEDROCK not configured.' } });
    return { statusCode: 503, inputTokens: 0, outputTokens: 0 };
  }
  const auth = `Bearer ${AWS_BEARER_TOKEN_BEDROCK}`;
  return streamOpenAiCompletionsToAnthropic(
    `${MANTLE_BASE}/v1/chat/completions`,
    auth,
    mantleModelId,
    reqBody,
    reply
  );
}

/**
 * Thin wrapper for streaming EKS self-hosted vLLM models.
 */
export async function streamVllmToAnthropic(
  modelId: string,
  reqBody: AnthropicRequestBody,
  reply: FastifyReply,
): Promise<{ statusCode: number; inputTokens: number; outputTokens: number }> {
  const baseModel = modelId.split('/')[1] || 'qwen-coder-32b';
  return streamOpenAiCompletionsToAnthropic(
    `${VLLM_ENDPOINT}/v1/chat/completions`,
    null,
    baseModel,
    reqBody,
    reply
  );
}

/**
 * Quick EKS vLLM host endpoint ping check
 */
export async function checkVllmHealth(): Promise<boolean> {
  try {
    const res = await request(`${VLLM_ENDPOINT}/health`, {
      method: 'GET',
      headersTimeout: 3000 // 3s timeout
    });
    return res.statusCode === 200;
  } catch {
    return false;
  }
}

/**
 * Sanitize tool use ID to match Anthropic pattern: [a-zA-Z0-9_-]+
 * OSS models may use IDs like "toolu_xxx" which need sanitization.
 * Falls back to a generated ID when the input is empty, since the pattern requires 1+ chars.
 */
function sanitizeToolUseId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned.length > 0 ? cleaned : `toolu_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Scrub tool_use.id / tool_result.tool_use_id across an inbound Anthropic request body.
 *
 * Clients (e.g. Claude Code) persist tool_use IDs from prior assistant turns in their local
 * conversation history and replay them on every subsequent request. If an earlier turn was
 * routed through an OSS/Mantle model that emitted a non-conforming ID, that bad ID gets
 * replayed on later turns too — including ones routed to the real Anthropic API via the
 * `anthropic/native` passthrough, which forwards the client's request body untouched and
 * has no translation step of its own to catch it. Sanitizing once here, at ingress, protects
 * every downstream route (native passthrough, Mantle Anthropic passthrough, OSS translation)
 * regardless of which model handled the turn that originally produced the ID.
 */
export function sanitizeAnthropicRequestBody(reqBody: AnthropicRequestBody): AnthropicRequestBody {
  if (!reqBody.messages) return reqBody;

  const sanitizeBlock = (c: ContentBlock): ContentBlock => {
    if (c.type === 'tool_use' && c.id) {
      return { ...c, id: sanitizeToolUseId(c.id) };
    }
    if (c.type === 'tool_result' && c.tool_use_id) {
      return { ...c, tool_use_id: sanitizeToolUseId(c.tool_use_id) };
    }
    return c;
  };

  return {
    ...reqBody,
    messages: reqBody.messages.map(m => ({
      ...m,
      content: Array.isArray(m.content) ? m.content.map(sanitizeBlock) : m.content,
    })),
  };
}

/**
 * Translate OpenAI chat completion format back to Anthropic Messages format.
 * Handles both plain text responses and tool_call responses from any OSS model
 * (DeepSeek, Qwen3, Devstral, Mistral, Kimi, GPT-OSS, etc.).
 */
export function translateOpenAIToAnthropic(openAIResponse: any, modelId: string): any {
  const choice = openAIResponse.choices?.[0];
  const message = choice?.message;

  // ── Stop reason ──────────────────────────────────────────────────────────────
  let stop_reason = 'end_turn';
  if (choice?.finish_reason === 'length')     stop_reason = 'max_tokens';
  else if (choice?.finish_reason === 'tool_calls') stop_reason = 'tool_use';

  // ── Content blocks ───────────────────────────────────────────────────────────
  const content: any[] = [];

  // Include text content if present and non-empty
  const textContent = message?.content;
  if (typeof textContent === 'string' && textContent.trim().length > 0) {
    content.push({ type: 'text', text: textContent });
  }

  // Translate tool_calls → Anthropic tool_use blocks.
  // Works for all OSS models that follow the OpenAI tool_calls spec.
  const toolCalls: OpenAIToolCall[] = message?.tool_calls || [];
  for (const tc of toolCalls) {
    let parsedInput: unknown = {};
    try {
      parsedInput = JSON.parse(tc.function?.arguments || '{}');
    } catch {
      parsedInput = { _raw: tc.function?.arguments };
    }
    const rawId = tc.id || `toolu_${Math.random().toString(36).substring(2, 11)}`;
    content.push({
      type:  'tool_use',
      id:    sanitizeToolUseId(rawId),
      name:  tc.function?.name  || 'unknown_tool',
      input: parsedInput,
    });
  }

  // Fallback: ensure content array is never empty (Claude Code rejects empty content)
  if (content.length === 0) {
    content.push({ type: 'text', text: '' });
  }

  return {
    id:            openAIResponse.id || `msg-${Math.random().toString(36).substring(2, 11)}`,
    type:          'message',
    role:          'assistant',
    content,
    model:         modelId,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens:  openAIResponse.usage?.prompt_tokens    || 0,
      output_tokens: openAIResponse.usage?.completion_tokens || 0,
    },
  };
}

/**
 * Mock VPN endpoint diagnostics ping check
 */
export async function checkVpnHealth(): Promise<boolean> {
  const vpnEndpoint = process.env.VPN_ENDPOINT || 'http://vpn-gateway.internal/health';
  try {
    const res = await request(vpnEndpoint, {
      method: 'GET',
      headersTimeout: 3000
    });
    return res.statusCode === 200;
  } catch {
    return false;
  }
}
