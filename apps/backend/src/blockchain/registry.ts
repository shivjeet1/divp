import { Contract, JsonRpcProvider, type Provider } from 'ethers';
import { config } from '../config';
import { AppError } from '../errors/AppError';

/**
 * Minimal ABI of IdentityRegistry. Kept in source (not imported from the
 * contracts workspace) so the backend build stays self-contained; the
 * contract source of truth remains contracts/src/IdentityRegistry.sol.
 */
export const IDENTITY_REGISTRY_ABI = [
  'function getIdentity(address wallet) view returns (bool registered, bool active, uint8 role)',
  'function isRegistered(address wallet) view returns (bool)',
  'function isActive(address wallet) view returns (bool)',
  'function getRole(address wallet) view returns (uint8)',
  'function owner() view returns (address)',
  'function registerIdentity(address wallet, uint8 role)',
  'function revokeIdentity(address wallet)',
  'function setRole(address wallet, uint8 role)',
  'event IdentityRegistered(address indexed wallet, uint8 indexed role)',
  'event IdentityRevoked(address indexed wallet, uint8 indexed previousRole)',
  'event RoleChanged(address indexed wallet, uint8 indexed previousRole, uint8 indexed newRole)',
] as const;

export const ROLE_NAMES = ['NONE', 'USER', 'OPERATOR', 'ADMIN'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export function roleName(role: number): RoleName {
  const name = ROLE_NAMES[role];
  if (!name)
    throw new AppError('IDENTITY_ROLE_INVALID', 403, 'On-chain role value is not recognized.');
  return name;
}

let provider: JsonRpcProvider | undefined;

export function getProvider(): JsonRpcProvider {
  if (!provider) {
    provider = new JsonRpcProvider(config.blockchain.rpcUrl, undefined, {
      staticNetwork: true,
      batchMaxCount: 1,
      // ethers caches eth_getTransactionCount by default (~250ms), which can
      // hand a stale nonce to back-to-back admin transactions ("tx doesn't
      // have the correct nonce"). Disable the cache.
      cacheTimeout: -1,
    });
  }
  return provider;
}

export function getRegistryContract(): Contract {
  const address = config.blockchain.contractAddress;
  if (!address) {
    throw new AppError(
      'CONTRACT_NOT_CONFIGURED',
      503,
      'IdentityRegistry address is not configured. Run `npm run deploy:contract`.',
    );
  }
  return new Contract(address, IDENTITY_REGISTRY_ABI, getProvider() as Provider);
}

/**
 * Startup verification: the RPC endpoint must answer and report the chain
 * id we think we are talking to (the plan requires reading the actual
 * running configuration rather than assuming it).
 */
export async function assertChainConfig(): Promise<void> {
  const network = await getProvider().getNetwork();
  if (Number(network.chainId) !== config.blockchain.chainId) {
    throw new Error(
      `Chain ID mismatch: .env says ${config.blockchain.chainId} but RPC ${config.blockchain.rpcUrl} reports ${network.chainId}.`,
    );
  }
  if (config.blockchain.contractAddress) {
    const code = await getProvider().getCode(config.blockchain.contractAddress);
    if (code === '0x') {
      throw new Error(
        `No contract bytecode at ${config.blockchain.contractAddress} on chain ${network.chainId}. Redeploy the contract.`,
      );
    }
  }
}
