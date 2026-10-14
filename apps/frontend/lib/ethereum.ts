/** Minimal EIP-1193 provider surface used by this app. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
  isMetaMask?: boolean;
}

export function getProvider(): Eip1193Provider | null {
  const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return injected ?? null;
}

export async function getAccounts(provider: Eip1193Provider): Promise<string[]> {
  try {
    return (await provider.request({ method: 'eth_accounts' })) as string[];
  } catch {
    return [];
  }
}

export async function requestAccounts(provider: Eip1193Provider): Promise<string[]> {
  return (await provider.request({ method: 'eth_requestAccounts' })) as string[];
}

export async function getChainId(provider: Eip1193Provider): Promise<number> {
  const hex = (await provider.request({ method: 'eth_chainId' })) as string;
  return Number.parseInt(hex, 16);
}

export async function personalSign(
  provider: Eip1193Provider,
  message: string,
  account: string,
): Promise<string> {
  return (await provider.request({
    method: 'personal_sign',
    params: [message, account],
  })) as string;
}

export function onAccountsChanged(provider: Eip1193Provider, cb: (accounts: string[]) => void) {
  provider.on?.('accountsChanged', cb as never);
  return () => provider.removeListener?.('accountsChanged', cb as never);
}

export function onChainChanged(provider: Eip1193Provider, cb: (chainIdHex: string) => void) {
  provider.on?.('chainChanged', cb as never);
  return () => provider.removeListener?.('chainChanged', cb as never);
}

/** Extracts a human-readable message from provider/backend errors. */
export function describeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { code?: number | string; message?: string; error?: string };
    if (e.code === 4001 || e.code === 'ACTION_REJECTED')
      return 'You rejected the signature request.';
    if (e.code === -32002) return 'A MetaMask request is already pending - check your wallet.';
    if (e.code === 4900 || e.code === 4902) return 'The wallet is disconnected from the network.';
    if (e.message) return e.message;
    if (e.error) return e.error;
  }
  if (error instanceof Error) return error.message;
  return 'Unexpected error.';
}
