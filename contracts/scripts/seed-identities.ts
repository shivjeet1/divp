import { ethers, network } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Seeds the deployed IdentityRegistry with the well-known local dev accounts
 * (mnemonic `test test ... junk`), so demos and tests have ready-made roles:
 *
 *   account #0 -> ADMIN   (deployer, already registered by deploy.ts)
 *   account #1 -> USER
 *   account #2 -> OPERATOR
 *   account #3 -> ADMIN
 *   account #4 -> (unregistered - used to demonstrate unauthorized access)
 *
 * Idempotent: already-active identities are skipped.
 */
const Role = { NONE: 0, USER: 1, OPERATOR: 2, ADMIN: 3 } as const;

const SEED: Array<{ index: number; role: number }> = [
  { index: 0, role: Role.ADMIN },
  { index: 1, role: Role.USER },
  { index: 2, role: Role.OPERATOR },
  { index: 3, role: Role.ADMIN },
];

async function main() {
  const deploymentPath = path.resolve(__dirname, '..', 'deployment.json');
  if (!fs.existsSync(deploymentPath)) {
    throw new Error('deployment.json not found. Run `npm run deploy` first.');
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  if (deployment.chainId !== Number((await ethers.provider.getNetwork()).chainId)) {
    throw new Error(
      `deployment.json chainId ${deployment.chainId} does not match the node - redeploy.`,
    );
  }

  const registry = await ethers.getContractAt('IdentityRegistry', deployment.address);
  const signers = await ethers.getSigners();

  for (const { index, role } of SEED) {
    const signer = signers[index];
    if (!signer) throw new Error(`Node does not expose account #${index}`);
    const active = await registry.isActive(signer.address);
    if (active) {
      console.log(`#${index} ${signer.address} already active - skipped`);
      continue;
    }
    const tx = await registry.registerIdentity(signer.address, role);
    await tx.wait();
    const onChainRole = await registry.getRole(signer.address);
    console.log(`#${index} ${signer.address} registered with role ${onChainRole}`);
  }

  const unregistered = signers[4];
  if (unregistered) {
    const registered = await registry.isRegistered(unregistered.address);
    console.log(
      `#4 ${unregistered.address} registered=${registered} (expected false: unauthorized demo wallet)`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
