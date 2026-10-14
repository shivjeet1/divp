import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite for the Decentralized Identity Verification Pipeline.
 *
 * A deterministic EIP-1193 provider (ethers backed by the well-known Hardhat
 * test mnemonic keys) is injected into the page BEFORE the Next.js app boots,
 * so the app behaves exactly as if a real MetaMask wallet were installed.
 * The backend (http://localhost:4000) and Ganache (:7545) must already be
 * running - see repository README "Quick start".
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
