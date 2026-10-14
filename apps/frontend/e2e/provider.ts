import { Page } from '@playwright/test';
import * as path from 'node:path';

/**
 * Test accounts: addresses and private keys derived from the deterministic
 * Ganache/Hardhat test mnemonic (`test test ... junk`). PUBLIC test material.
 */
export interface TestAccount {
  label: string;
  address: string; // lower-case
  addressChecksummed: string;
  key: string;
  role: 'ADMIN' | 'OPERATOR' | 'USER' | 'NONE';
}

function acc(label: string, address: string, key: string, role: TestAccount['role']): TestAccount {
  return {
    label,
    address: address.toLowerCase(),
    addressChecksummed: address,
    key,
    role,
  };
}

export const ACCOUNT = {
  ADMIN_0: acc(
    '#0',
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    'ADMIN',
  ),
  USER_1: acc(
    '#1',
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    'USER',
  ),
  OPERATOR_2: acc(
    '#2',
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    'OPERATOR',
  ),
  ADMIN_3: acc(
    '#3',
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    'ADMIN',
  ),
  UNREGISTERED_4: acc(
    '#4',
    '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
    'NONE',
  ),
};

export const WALLET_KEYS: Record<string, string> = Object.fromEntries(
  Object.values(ACCOUNT).map((a) => [a.address, a.key]),
);

const ETHER_UMD = path.resolve(__dirname, '../../../node_modules/ethers/dist/ethers.umd.min.js');

const INIT_SCRIPT = ({
  unlocked,
  chainIdHex,
  keys,
}: {
  unlocked: string[];
  chainIdHex: string;
  keys: Record<string, string>;
}) => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  // Persist provider state across navigations via sessionStorage so a reload
  // behaves like a real MetaMask (the app must restore the cookie session).
  const KEY = '__divp_state';
  let persisted: { accounts: string[]; unlocked: string[]; chainIdHex: string } | null = null;
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY) : null;
    persisted = raw ? (JSON.parse(raw) as typeof persisted) : null;
  } catch {
    persisted = null;
  }

  const state = persisted ?? { accounts: [] as string[], unlocked, chainIdHex };

  const persist = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  };
  persist();

  (window as unknown as { __divp: unknown }).__divp = { state, persist };

  // Mutable signing-key store so tests can add a fresh random wallet at
  // runtime (used by the self-registration test to stay idempotent).
  const walletKeys = new Map<string, string>(Object.entries(keys));
  (window as unknown as { __divpWalletKeys: Map<string, string> }).__divpWalletKeys = walletKeys;
  (
    window as unknown as { __divpAddWallet: (address: string, key: string) => void }
  ).__divpAddWallet = (address: string, key: string) => {
    walletKeys.set(address.toLowerCase(), key);
  };

  const provider = {
    isMetaMask: true,
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    removeListener(event: string, handler: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(handler);
    },
    async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
      const { method, params } = args;
      switch (method) {
        case 'eth_accounts':
          return state.accounts.slice();
        case 'eth_requestAccounts':
          state.accounts = state.unlocked.slice();
          persist();
          return state.accounts.slice();
        case 'eth_chainId':
          return state.chainIdHex;
        case 'personal_sign': {
          const [message, address] = params as [string, string];
          const wallet =
            typeof (window as unknown as { __divpWalletFor?: unknown }).__divpWalletFor ===
            'function'
              ? (
                  window as unknown as {
                    __divpWalletFor: (a: string) => { signMessage(m: string): Promise<string> };
                  }
                ).__divpWalletFor(address)
              : null;
          if (!wallet) throw new Error('wallet library not initialized yet');
          return wallet.signMessage(message);
        }
        default:
          throw new Error(`unsupported RPC method: ${method}`);
      }
    },
  };

  (window as unknown as { __divpEmit: (event: string, ...args: unknown[]) => void }).__divpEmit = (
    event: string,
    ...args: unknown[]
  ) => {
    for (const handler of listeners.get(event) ?? []) handler(...args);
  };

  Object.defineProperty(window, 'ethereum', { value: provider, configurable: true });
};

/**
 * Installs the fake EIP-1193 provider BEFORE any page script runs, then loads
 * the ethers UMD bundle and wires the signing wallet. Call before first goto.
 */
export async function installProvider(
  page: Page,
  unlocked: TestAccount,
  chainIdHex = '0x539',
): Promise<void> {
  await page.addInitScript(INIT_SCRIPT, {
    unlocked: [unlocked.address],
    chainIdHex,
    keys: WALLET_KEYS,
  });
  await page.goto('/');
  await page.addScriptTag({ path: ETHER_UMD });
  await page.evaluate(() => {
    (window as unknown as { __divpWalletFor: (a: string) => unknown }).__divpWalletFor = (
      address: string,
    ) => {
      const key = (
        window as unknown as { __divpWalletKeys: Map<string, string> }
      ).__divpWalletKeys.get(address.toLowerCase());
      if (!key) throw new Error(`no test key for ${address}`);
      const ethers = (window as unknown as { ethers: { Wallet: new (k: string) => unknown } })
        .ethers;
      return new ethers.Wallet(key);
    };
  });

  // Give the boot effect time to read the (already connected) wallets.
  await page.waitForSelector('[data-testid="auth-status"]');
}

/**
 * Switches the fake provider to a fresh random wallet (key generated in the
 * test process) so the self-registration test is idempotent across runs on a
 * persistent chain. Returns the checksummed address for assertions.
 */
export async function connectRandomWallet(
  page: Page,
): Promise<{ address: string; addressChecksummed: string }> {
  const { Wallet } = await import('ethers');
  const wallet = Wallet.createRandom();

  await page.evaluate(
    ({ address, key }) => {
      (window as unknown as { __divpAddWallet: (a: string, k: string) => void }).__divpAddWallet(
        address,
        key,
      );
      (
        window as unknown as { __divp: { state: { accounts: string[] }; persist(): void } }
      ).__divp.state.accounts = [address];
      (window as unknown as { __divp: { persist(): void } }).__divp.persist();
      (window as unknown as { __divpEmit: (e: string, ...a: unknown[]) => void }).__divpEmit(
        'accountsChanged',
        [address],
      );
    },
    { address: wallet.address, key: wallet.privateKey },
  );

  return { address: wallet.address.toLowerCase(), addressChecksummed: wallet.address };
}
