// Shared, runtime-neutral helpers for Edge Functions. Contains no Deno globals, so the
// contract modules that use it can run under Vitest with an injected fetch.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export type ErrorCode =
  | 'method_not_allowed'
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_action'
  | 'invalid_input'
  | 'config_error'
  | 'quota_exceeded'
  | 'provider_timeout'
  | 'provider_error'
  | 'malformed_provider_response'
  | 'not_found'
  | 'internal_error';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  method_not_allowed: 405,
  unauthorized: 401,
  forbidden: 403,
  invalid_action: 400,
  invalid_input: 400,
  config_error: 503,
  quota_exceeded: 429,
  provider_timeout: 504,
  provider_error: 502,
  malformed_provider_response: 502,
  not_found: 404,
  internal_error: 500,
};

export class ContractError extends Error {
  constructor(public readonly code: ErrorCode, message: string) {
    super(message);
    this.name = 'ContractError';
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(err: unknown, requestId: string): Response {
  // Unknown errors never echo their message: a provider URL or key could be in it.
  const code: ErrorCode = err instanceof ContractError ? err.code : 'internal_error';
  const message = err instanceof ContractError ? err.message : 'An unexpected server error occurred.';
  return jsonResponse({ error: { code, message }, requestId }, STATUS_BY_CODE[code]);
}

export const DEFAULT_TIMEOUT_MS = 8000;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetches JSON with a timeout and a response size limit. Provider error bodies are not
 * forwarded. Returns the parsed body with the HTTP status for the caller to classify.
 */
export async function fetchProviderJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ status: number; ok: boolean; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  let text: string;
  try {
    res = await fetchImpl(url, { ...init, signal: controller.signal });
    text = await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ContractError('provider_timeout', 'The data provider did not respond in time.');
    }
    throw new ContractError('provider_error', 'Could not reach the data provider.');
  } finally {
    clearTimeout(timer);
  }

  if (text.length > MAX_RESPONSE_BYTES) {
    throw new ContractError('malformed_provider_response', 'The data provider returned an oversized response.');
  }

  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) {
        throw new ContractError('malformed_provider_response', 'The data provider returned invalid JSON.');
      }
    }
  }
  return { status: res.status, ok: res.ok, body };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateQuery(raw: unknown, maxLength = 100): string {
  if (typeof raw !== 'string') {
    throw new ContractError('invalid_input', 'A search query is required.');
  }
  const query = raw.trim();
  if (query.length === 0) {
    throw new ContractError('invalid_input', 'Search query cannot be empty.');
  }
  if (query.length > maxLength) {
    throw new ContractError('invalid_input', `Search query cannot exceed ${maxLength} characters.`);
  }
  return query;
}
