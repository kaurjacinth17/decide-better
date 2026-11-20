import Anthropic from '@anthropic-ai/sdk';
import type { AiErrorBody, AiErrorCode } from '@/lib/ai/schemas';

const STATUS: Record<AiErrorCode, number> = {
  unavailable: 503,
  rate_limited: 429,
  bad_request: 400,
  refused: 422,
  invalid_output: 502,
  upstream: 502,
  timeout: 504,
};

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }

  get status() {
    return STATUS[this.code];
  }

  toBody(): AiErrorBody {
    return { error: { code: this.code, message: this.message, ...(this.retryAfter ? { retryAfter: this.retryAfter } : {}) } };
  }

  /** Map SDK errors (most specific first) to user-safe messages. Never leaks keys or raw upstream text. */
  static fromSdk(e: unknown): AiError {
    if (e instanceof AiError) return e;
    if (e instanceof Anthropic.APIConnectionTimeoutError) return new AiError('timeout', 'The AI took too long to answer. Try again.');
    if (e instanceof Anthropic.APIConnectionError)
      return new AiError('upstream', 'Could not reach the AI service. Check the connection and try again.');
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
      return new AiError('unavailable', 'AI suggestions are not available: the server’s API key was rejected.');
    if (e instanceof Anthropic.RateLimitError) return new AiError('rate_limited', 'The AI service is busy. Try again in a minute.', 60);
    if (e instanceof Anthropic.BadRequestError) return new AiError('bad_request', 'The AI service could not process this request.');
    if (e instanceof Anthropic.InternalServerError)
      return new AiError('upstream', 'The AI service is temporarily overloaded. Try again shortly.');
    if (e instanceof Anthropic.APIError) return new AiError('upstream', 'The AI service returned an error. Try again.');
    return new AiError('upstream', 'Something went wrong while asking the AI. Try again.');
  }
}
