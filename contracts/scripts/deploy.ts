import { ethers, network, artifacts } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Deploys IdentityRegistry to the running local EVM (Ganache), registers the
 * deployer as the initial ADMIN (so the optional admin API is usable), writes
 * `deployment.json` and updates the root `.env` with the contract address.
 *
 * The deployer key comes from the node's unlocked accounts (`accounts: remote`).
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      `No unlocked account available on network "${network.name}". Is Ganache running?`,
    );
  }

  const { chainId } = await ethers.provider.getNetwork();
  console.log(`Network:  ${network.name} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const factory = await ethers.getContractFactory('IdentityRegistry');
  const registry = await factory.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  // Bootstrap: the deployer becomes the first ADMIN identity so the admin
  // endpoints and the owner-gated contract calls share one wallet in dev.
  const tx = await registry.registerIdentity(deployer.address, 3 /* Role.ADMIN */);
  await tx.wait();

  const adminRole = await registry.getRole(deployer.address);
  console.log(`IdentityRegistry deployed at: ${address}`);
  console.log(`Deployer registered as role:  ${adminRole} (3 = ADMIN)`);

  const artifact = await artifacts.readArtifact('IdentityRegistry');
  const deployment = {
    network: network.name,
    chainId: Number(chainId),
    contract: 'IdentityRegistry',
    address,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };

  const outPath = path.resolve(__dirname, '..', 'deployment.json');
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log(`Wrote ${outPath}`);

  // Keep the root .env in sync so backend/tests pick the address up.
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    if (/^IDENTITY_CONTRACT_ADDRESS=.*$/m.test(env)) {
      const updated = env.replace(
        /^IDENTITY_CONTRACT_ADDRESS=.*$/m,
        `IDENTITY_CONTRACT_ADDRESS=${address}`,
      );
      fs.writeFileSync(envPath, updated);
      console.log(`Updated IDENTITY_CONTRACT_ADDRESS in ${envPath}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
