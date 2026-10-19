import { Wallet, type Contract, type EventLog } from 'ethers';
import { config } from '../config';
import { AppError } from '../errors/AppError';
import { getProvider, getRegistryContract, ROLE_NAMES, type RoleName } from './registry';
import { normalizeAddress } from '../utils/address';

export interface IdentityState {
  walletAddress: string;
  registered: boolean;
  active: boolean;
  role: RoleName;
}

/**
 * Administrative contract operations (optional admin API).
 *
 * The backend signs transactions with `ADMIN_PRIVATE_KEY`. In this local
 * environment that is a well-known Ganache dev key, documented in the
 * README; in production this would be a dedicated, HSM-backed operator key.
 * If the variable is unset, all write endpoints fail closed.
 */
function adminContract(): Contract {
  if (!config.admin.privateKey) {
    throw new AppError(
      'ADMIN_SIGNER_NOT_CONFIGURED',
      503,
      'Administrative signing is not configured on this server.',
    );
  }
  let signer: Wallet;
  try {
    // Attach the shared provider: a bare Wallet cannot send transactions
    // ("missing provider" at send time).
    signer = new Wallet(config.admin.privateKey, getProvider());
  } catch {
    throw new AppError(
      'ADMIN_SIGNER_NOT_CONFIGURED',
      503,
      'Administrative signing configuration is invalid.',
    );
  }
  return getRegistryContract().connect(signer) as unknown as Contract;
}

async function runAdminTx(
  description: string,
  send: () => Promise<{ wait: () => Promise<unknown> }>,
): Promise<void> {
  try {
    const tx = await send();
    await tx.wait();
  } catch (error) {
    const reason = (error as { shortMessage?: string }).shortMessage ?? (error as Error).message;
    console.error(`[admin] ${description} failed:`, reason);
    throw new AppError('ADMIN_TX_FAILED', 502, `${description} could not be executed on-chain.`);
  }
}

export const adminRegistry = {
  async listIdentities(): Promise<IdentityState[]> {
    const contract = getRegistryContract();
    try {
      // Fetch events in bounded block-range chunks. Unbounded queryFilter calls
      // break at scale (RPC log limits, timeouts); chunking keeps every query
      // small regardless of how much history the registry accumulates.
      const latestBlock = await getProvider().getBlockNumber();
      const CHUNK = 2000;

      const registered: EventLog[] = [];
      const revoked: EventLog[] = [];
      const changed: EventLog[] = [];

      for (let fromBlock = 0; fromBlock <= latestBlock; fromBlock += CHUNK) {
        const toBlock = Math.min(fromBlock + CHUNK - 1, latestBlock);
        const chunk = (await Promise.all([
          contract.queryFilter(contract.filters.IdentityRegistered(), fromBlock, toBlock),
          contract.queryFilter(contract.filters.IdentityRevoked(), fromBlock, toBlock),
          contract.queryFilter(contract.filters.RoleChanged(), fromBlock, toBlock),
        ])) as unknown as EventLog[][];
        registered.push(...chunk[0]);
        revoked.push(...chunk[1]);
        changed.push(...chunk[2]);
      }

      const events = [...registered, ...revoked, ...changed].sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
        return (a.index ?? 0) - (b.index ?? 0);
      });

      const state = new Map<string, IdentityState>();
      for (const event of events) {
        const wallet = normalizeAddress(String(event.args[0]));
        const current = state.get(wallet) ?? {
          walletAddress: wallet,
          registered: false,
          active: false,
          role: 'NONE' as RoleName,
        };
        switch (event.eventName) {
          case 'IdentityRegistered':
            current.registered = true;
            current.active = true;
            current.role = ROLE_NAMES[Number(event.args[1])] ?? 'NONE';
            break;
          case 'RoleChanged':
            current.role = ROLE_NAMES[Number(event.args[2])] ?? 'NONE';
            break;
          case 'IdentityRevoked':
            current.active = false;
            current.role = 'NONE';
            break;
        }
        state.set(wallet, current);
      }
      return [...state.values()].sort((a, b) => a.walletAddress.localeCompare(b.walletAddress));
    } catch (error) {
      console.error('[admin] failed to read registry events:', (error as Error).message);
      throw new AppError('CHAIN_UNAVAILABLE', 503, 'Identity registry is unreachable.');
    }
  },

  async register(walletAddress: string, role: RoleName): Promise<void> {
    const contract = adminContract();
    const roleValue = ROLE_NAMES.indexOf(role);
    await runAdminTx('registerIdentity', () =>
      contract.registerIdentity(normalizeAddress(walletAddress), roleValue),
    );
  },

  async setRole(walletAddress: string, role: RoleName): Promise<void> {
    const contract = adminContract();
    const roleValue = ROLE_NAMES.indexOf(role);
    await runAdminTx('setRole', () => contract.setRole(normalizeAddress(walletAddress), roleValue));
  },

  async revoke(walletAddress: string): Promise<void> {
    const contract = adminContract();
    await runAdminTx('revokeIdentity', () =>
      contract.revokeIdentity(normalizeAddress(walletAddress)),
    );
  },
};
