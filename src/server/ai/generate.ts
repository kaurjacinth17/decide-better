/**
 * The single place that calls the Anthropic API. Returns schema-validated JSON via
 * structured outputs (`output_config.format`) — forced tool_choice is rejected by
 * Claude Sonnet 5.5, so structured outputs are the way to get guaranteed JSON.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { AiError } from './errors';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const aiModel = () => process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
/** The key is read on the server only and never sent to the browser. */
export const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1']);

export type Effort = 'low' | 'medium' | 'high';

export interface GenerateSpec<S extends z.ZodType> {
  schema: S;
  system: string;
  user: string;
  effort: Effort;
  maxTokens?: number;
  /** Aborts the call when the route's overall deadline passes. */
  signal?: AbortSignal;
}

/** Dependency injected into handlers so they can be tested without the API. */
export type Generate = <S extends z.ZodType>(spec: GenerateSpec<S>) => Promise<z.infer<S>>;

let client: Anthropic | null = null;
const getClient = () =>
  (client ??= new Anthropic({
    // TypeScript SDK timeouts are in milliseconds. Retries cover 408/409/429/5xx and connection errors.
    // Per attempt; the route also enforces an overall deadline so a request fits the host's 60 s limit.
    timeout: 50_000,
    maxRetries: 1,
  }));

export const generate: Generate = async (spec) => {
  if (!aiConfigured()) throw new AiError('unavailable', 'AI suggestions are not set up on this server.');
  const model = aiModel();
  const useFallback = FALLBACK_MODELS.has(model);
  let res;
  try {
    res = await getClient().beta.messages.parse(
      {
        model,
        max_tokens: spec.maxTokens ?? 8000,
        system: spec.system,
        messages: [{ role: 'user', content: spec.user }],
        output_config: { effort: spec.effort, format: betaZodOutputFormat(spec.schema) },
        // If the model declines on policy grounds, the API retries on a suitable fallback model in the same call.
        ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { signal: spec.signal },
    );
  } catch (e) {
    throw AiError.fromSdk(e);
  }
  if (res.stop_reason === 'refusal') throw new AiError('refused', 'The AI declined to help with this request.');
  if (res.stop_reason === 'max_tokens')
    throw new AiError('invalid_output', 'The AI response was cut short. Try again with a shorter description.');
  if (res.parsed_output === null || res.parsed_output === undefined)
    throw new AiError('invalid_output', 'The AI returned something unexpected. Try again.');
  return res.parsed_output as z.infer<typeof spec.schema>;
};
