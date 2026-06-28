import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { request } from 'undici';
import * as dotenv from 'dotenv';

dotenv.config();

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
  reqBody: any,
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

  const bedrockPayload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: reqBody.max_tokens || 1024,
    messages: reqBody.messages,
    system: reqBody.system,
    temperature: reqBody.temperature,
    top_p: reqBody.top_p,
    top_k: reqBody.top_k,
    stop_sequences: reqBody.stop_sequences
  };

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
 * Translate Anthropic message structures to OpenAI/vLLM structures
 */
export function translateAnthropicToOpenAI(reqBody: any, modelName: string): any {
  const messages = reqBody.messages || [];
  const openAIMessages = messages.map((m: any) => {
    let content = '';
    if (typeof m.content === 'string') {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
    }
    return {
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content
    };
  });

  // Inject system prompt if present
  if (reqBody.system) {
    openAIMessages.unshift({
      role: 'system',
      content: reqBody.system
    });
  }

  return {
    model: modelName,
    messages: openAIMessages,
    max_tokens: reqBody.max_tokens || 1024,
    temperature: reqBody.temperature || 0.7,
    stream: reqBody.stream || false
  };
}

/**
 * Proxy request to the EKS-hosted vLLM inference endpoint
 */
export async function invokeVllmModel(
  modelId: string,
  reqBody: any
): Promise<{ statusCode: number; headers: Record<string, string>; body: any }> {
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
      headersTimeout: 15000 // 15s timeout
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
  reqBody: any
): Promise<{ statusCode: number; body: string }> {
  if (!AWS_BEARER_TOKEN_BEDROCK) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: { type: 'api_error', message: 'AWS_BEARER_TOKEN_BEDROCK is not configured.' } }),
    };
  }
  const payload = {
    model: mantleModelId,
    max_tokens: reqBody.max_tokens || 1024,
    messages: reqBody.messages,
    system: reqBody.system,
    temperature: reqBody.temperature,
    top_p: reqBody.top_p,
    stop_sequences: reqBody.stop_sequences,
    stream: reqBody.stream || false,
  };
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
 * OSS / third-party models via Bedrock Mantle Chat Completions API.
 * Takes the exact Mantle model ID (e.g. 'qwen.qwen3-coder-next').
 * Response is in OpenAI format — caller must translate back to Anthropic.
 */
export async function invokeMantleOssModel(
  mantleModelId: string,
  reqBody: any
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
      headersTimeout: 30000,
    });
    const bodyText = await res.body.text();
    const contentType = (res.headers['content-type'] as string) || 'application/json';
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
 * Translate OpenAI chat completion format back to Anthropic message format
 */
export function translateOpenAIToAnthropic(openAIResponse: any, modelId: string): any {
  const choice = openAIResponse.choices?.[0];
  const contentText = choice?.message?.content || '';

  let stopReason = 'end_turn';
  if (choice?.finish_reason === 'length') {
    stopReason = 'max_tokens';
  } else if (choice?.finish_reason === 'stop') {
    stopReason = 'end_turn';
  }

  return {
    id: openAIResponse.id || `msg-${Math.random().toString(36).substring(2, 11)}`,
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: contentText
      }
    ],
    model: modelId,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: openAIResponse.usage?.prompt_tokens || 0,
      output_tokens: openAIResponse.usage?.completion_tokens || 0
    }
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
