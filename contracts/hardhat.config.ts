import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Root .env (RPC_URL, CHAIN_ID) - the contracts workspace reads the shared env file.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const rpcUrl = process.env.RPC_URL ?? 'http://127.0.0.1:7545';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    ganache: {
      url: rpcUrl,
      // Chain id is taken from the running node at deploy time; the
      // config value below is only used for static tooling checks.
      chainId: Number(process.env.CHAIN_ID ?? 1337),
      // Use the accounts the running Ganache node exposes unlocked.
      // No private key material is configured in this repository.
      accounts: 'remote',
    },
    hardhat: {
      chainId: 1337,
    },
  },
  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
