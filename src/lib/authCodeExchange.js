import { isAuthFlowId } from './authLinks.js';

// Keep one exchange per code/flow, including when Linking delivers a callback twice.
// The client is injected so the complete PKCE path can be tested without native state.
export function createAuthCodeExchanger(client) {
  const exchanges = new Map();
  return (parsed) => {
    if (!parsed?.code || (parsed.flowId !== undefined && !isAuthFlowId(parsed.flowId)))
      return Promise.reject(new Error('Invalid account callback.'));
    const key = `${parsed.flowId || 'legacy'}:${parsed.code}`;
    if (exchanges.has(key)) return exchanges.get(key);
    const operation = (async () => {
      const { data, error } = await client.auth.exchangeCodeForSession(
        parsed.code,
        parsed.flowId ? { flowId: parsed.flowId } : undefined,
      );
      if (error) throw error;
      return data;
    })();
    exchanges.set(key, operation);
    operation.then(
      () => {
        if (exchanges.size > 20) exchanges.delete(exchanges.keys().next().value);
      },
      () => {
        if (exchanges.get(key) === operation) exchanges.delete(key);
      },
    );
    return operation;
  };
}

const names = new Set([
  'AuthPKCECodeVerifierMissingError',
  'AuthApiError',
  'AuthRetryableFetchError',
  'AuthInvalidTokenResponseError',
  'AuthUnknownError',
  'Error',
  'TypeError',
]);
const codes = new Set([
  'pkce_code_verifier_not_found',
  'bad_code_verifier',
  'flow_state_not_found',
  'flow_state_expired',
  'otp_expired',
  'request_timeout',
  'session_not_found',
  'unexpected_failure',
  'validation_failed',
  'invalid_credentials',
]);

// Never log callback URLs, authorization codes, verifiers, messages or tokens.
export function authExchangeDiagnostic(error) {
  return {
    name: names.has(error?.name) ? error.name : 'AuthError',
    code: codes.has(error?.code) ? error.code : 'unknown',
    status:
      Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599
        ? error.status
        : null,
  };
}
