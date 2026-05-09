import OpenAI from 'openai';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OpenAIUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

interface GenerateTextOptions {
  instructions?: string;
  messages: ChatMessage[];
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
const DEFAULT_OPENAI_FAST_MODEL = process.env.OPENAI_FAST_MODEL || DEFAULT_OPENAI_MODEL;

let client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  client = new OpenAI({ apiKey });
  return client;
}

function normalizeMessages(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.content?.trim())
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function getModelPricing(model: string): { input: number; output: number } | null {
  const normalized = model.toLowerCase();

  if (normalized.startsWith('gpt-5.2-codex')) return { input: 1.75, output: 14 };
  if (normalized.startsWith('gpt-5-codex')) return { input: 1.25, output: 10 };
  if (normalized.startsWith('gpt-5-mini')) return { input: 0.25, output: 2 };
  if (normalized.startsWith('gpt-5')) return { input: 1.25, output: 10 };
  if (normalized.startsWith('gpt-4.1-mini')) return { input: 0.4, output: 1.6 };
  if (normalized.startsWith('gpt-4.1')) return { input: 2, output: 8 };
  if (normalized.startsWith('codex-mini-latest')) return { input: 1.5, output: 6 };

  return null;
}

export function estimateOpenAICostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(model);
  if (!pricing) return 0;

  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

export function extractJsonString(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];

  return text.trim();
}

export async function generateText(options: GenerateTextOptions): Promise<{ text: string; usage: OpenAIUsage; model: string }> {
  const model = options.model || DEFAULT_OPENAI_MODEL;
  const response = await getOpenAIClient().responses.create({
    model,
    instructions: options.instructions,
    input: normalizeMessages(options.messages),
    max_output_tokens: options.maxOutputTokens,
    temperature: options.temperature,
    text: { format: { type: 'text' } },
  });

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  return {
    text: response.output_text.trim(),
    usage: {
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateOpenAICostUsd(model, inputTokens, outputTokens),
    },
    model,
  };
}

export async function generateJson<T>(options: GenerateTextOptions): Promise<{ data: T; usage: OpenAIUsage; model: string; rawText: string }> {
  const result = await generateText(options);
  return {
    data: JSON.parse(extractJsonString(result.text)) as T,
    usage: result.usage,
    model: result.model,
    rawText: result.text,
  };
}

export function getDefaultOpenAIModel(): string {
  return DEFAULT_OPENAI_MODEL;
}

export function getDefaultOpenAIFastModel(): string {
  return DEFAULT_OPENAI_FAST_MODEL;
}
