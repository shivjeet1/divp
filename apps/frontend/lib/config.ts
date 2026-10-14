/**
 * Frontend configuration. Security-critical values (chain id, SIWE domain,
 * URI) are fetched from the backend `/auth/config` at runtime - the frontend
 * never hardcodes them and the backend independently re-validates everything.
 */
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';

export const EXPECTED_CHAIN_NAME =
  process.env.NEXT_PUBLIC_CHAIN_NAME ?? 'Ganache Local (chainId 1337)';
