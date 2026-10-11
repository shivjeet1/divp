import { expect } from 'chai';
import { ethers } from 'hardhat';
import { IdentityRegistry } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

const Role = {
  NONE: 0,
  USER: 1,
  OPERATOR: 2,
  ADMIN: 3,
} as const;

describe('IdentityRegistry', () => {
  let registry: IdentityRegistry;
  let owner: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;
  let walletA: HardhatEthersSigner;
  let walletB: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, stranger, walletA, walletB] = await ethers.getSigners();
    const factory = await ethers.getContractFactory('IdentityRegistry');
    registry = (await factory.deploy()) as unknown as IdentityRegistry;
    await registry.waitForDeployment();
  });

  describe('deployment', () => {
    it('sets the deployer as owner', async () => {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it('emits OwnershipTransferred on construction', async () => {
      const factory = await ethers.getContractFactory('IdentityRegistry');
      const fresh = await factory.deploy();
      const receipt = await fresh.deploymentTransaction()!.wait();
      const address = await fresh.getAddress();
      await expect(receipt)
        .to.emit(fresh, 'OwnershipTransferred')
        .withArgs(ethers.ZeroAddress, owner.address);
      expect(await fresh.getRole(address)).to.equal(Role.NONE);
    });

    it('starts with every wallet unauthorized', async () => {
      expect(await registry.isRegistered(walletA.address)).to.equal(false);
      expect(await registry.isActive(walletA.address)).to.equal(false);
      expect(await registry.getRole(walletA.address)).to.equal(Role.NONE);
    });
  });

  describe('registerIdentity', () => {
    it('registers a wallet with the requested role', async () => {
      await expect(registry.registerIdentity(walletA.address, Role.USER))
        .to.emit(registry, 'IdentityRegistered')
        .withArgs(walletA.address, Role.USER);

      expect(await registry.isRegistered(walletA.address)).to.equal(true);
      expect(await registry.isActive(walletA.address)).to.equal(true);
      expect(await registry.getRole(walletA.address)).to.equal(Role.USER);
    });

    it('supports all non-NONE roles', async () => {
      for (const role of [Role.USER, Role.OPERATOR, Role.ADMIN]) {
        await registry.registerIdentity(walletA.address, role);
        expect(await registry.getRole(walletA.address)).to.equal(role);
        await registry.revokeIdentity(walletA.address);
      }
      // distinct wallets with distinct roles coexist
      await registry.registerIdentity(walletA.address, Role.USER);
      await registry.registerIdentity(walletB.address, Role.OPERATOR);
      expect(await registry.getRole(walletA.address)).to.equal(Role.USER);
      expect(await registry.getRole(walletB.address)).to.equal(Role.OPERATOR);
    });

    it('exposes identity through getIdentity', async () => {
      await registry.registerIdentity(walletA.address, Role.OPERATOR);
      const [registered, active, role] = await registry.getIdentity(walletA.address);
      expect(registered).to.equal(true);
      expect(active).to.equal(true);
      expect(role).to.equal(Role.OPERATOR);
    });

    it('rejects duplicate registration of an active identity', async () => {
      await registry.registerIdentity(walletA.address, Role.USER);
      await expect(registry.registerIdentity(walletA.address, Role.USER))
        .to.be.revertedWithCustomError(registry, 'AlreadyRegistered')
        .withArgs(walletA.address);
      await expect(registry.registerIdentity(walletA.address, Role.ADMIN))
        .to.be.revertedWithCustomError(registry, 'AlreadyRegistered')
        .withArgs(walletA.address);
    });

    it('rejects the zero address', async () => {
      await expect(
        registry.registerIdentity(ethers.ZeroAddress, Role.USER),
      ).to.be.revertedWithCustomError(registry, 'ZeroAddress');
    });

    it('rejects the invalid role NONE', async () => {
      await expect(
        registry.registerIdentity(walletA.address, Role.NONE),
      ).to.be.revertedWithCustomError(registry, 'InvalidRole');
    });

    it('rejects non-owner registration', async () => {
      await expect(
        registry.connect(stranger).registerIdentity(walletA.address, Role.USER),
      ).to.be.revertedWithCustomError(registry, 'NotOwner');
    });

    it('allows re-registration of a revoked identity', async () => {
      await registry.registerIdentity(walletA.address, Role.USER);
      await registry.revokeIdentity(walletA.address);

      await expect(registry.registerIdentity(walletA.address, Role.OPERATOR))
        .to.emit(registry, 'IdentityRegistered')
        .withArgs(walletA.address, Role.OPERATOR);

      expect(await registry.isActive(walletA.address)).to.equal(true);
      expect(await registry.getRole(walletA.address)).to.equal(Role.OPERATOR);
    });
  });

  describe('revokeIdentity', () => {
    beforeEach(async () => {
      await registry.registerIdentity(walletA.address, Role.ADMIN);
    });

    it('deactivates the identity and clears its role', async () => {
      await expect(registry.revokeIdentity(walletA.address))
        .to.emit(registry, 'IdentityRevoked')
        .withArgs(walletA.address, Role.ADMIN)
        .and.to.emit(registry, 'RoleChanged')
        .withArgs(walletA.address, Role.ADMIN, Role.NONE);

      expect(await registry.isRegistered(walletA.address)).to.equal(true); // history kept
      expect(await registry.isActive(walletA.address)).to.equal(false);
      expect(await registry.getRole(walletA.address)).to.equal(Role.NONE);

      const [registered, active, role] = await registry.getIdentity(walletA.address);
      expect(registered).to.equal(true);
      expect(active).to.equal(false);
      expect(role).to.equal(Role.NONE);
    });

    it('rejects revoking an unregistered wallet', async () => {
      await expect(registry.revokeIdentity(walletB.address)).to.be.revertedWithCustomError(
        registry,
        'NotRegistered',
      );
    });

    it('rejects double revocation', async () => {
      await registry.revokeIdentity(walletA.address);
      await expect(registry.revokeIdentity(walletA.address)).to.be.revertedWithCustomError(
        registry,
        'NotActive',
      );
    });

    it('rejects the zero address', async () => {
      await expect(registry.revokeIdentity(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        registry,
        'ZeroAddress',
      );
    });

    it('rejects non-owner revocation', async () => {
      await expect(
        registry.connect(stranger).revokeIdentity(walletA.address),
      ).to.be.revertedWithCustomError(registry, 'NotOwner');
    });
  });

  describe('setRole', () => {
    beforeEach(async () => {
      await registry.registerIdentity(walletA.address, Role.USER);
    });

    it('changes the role and emits RoleChanged', async () => {
      await expect(registry.setRole(walletA.address, Role.OPERATOR))
        .to.emit(registry, 'RoleChanged')
        .withArgs(walletA.address, Role.USER, Role.OPERATOR);

      expect(await registry.getRole(walletA.address)).to.equal(Role.OPERATOR);
      expect(await registry.isActive(walletA.address)).to.equal(true);
    });

    it('rejects an unchanged role', async () => {
      await expect(registry.setRole(walletA.address, Role.USER))
        .to.be.revertedWithCustomError(registry, 'RoleUnchanged')
        .withArgs(walletA.address, Role.USER);
    });

    it('rejects role NONE (use revokeIdentity instead)', async () => {
      await expect(registry.setRole(walletA.address, Role.NONE)).to.be.revertedWithCustomError(
        registry,
        'InvalidRole',
      );
    });

    it('rejects unregistered wallets', async () => {
      await expect(registry.setRole(walletB.address, Role.USER)).to.be.revertedWithCustomError(
        registry,
        'NotRegistered',
      );
    });

    it('rejects revoked identities', async () => {
      await registry.revokeIdentity(walletA.address);
      await expect(registry.setRole(walletA.address, Role.ADMIN)).to.be.revertedWithCustomError(
        registry,
        'NotActive',
      );
    });

    it('rejects the zero address', async () => {
      await expect(registry.setRole(ethers.ZeroAddress, Role.USER)).to.be.revertedWithCustomError(
        registry,
        'ZeroAddress',
      );
    });

    it('rejects non-owner role changes', async () => {
      await expect(
        registry.connect(stranger).setRole(walletA.address, Role.ADMIN),
      ).to.be.revertedWithCustomError(registry, 'NotOwner');
    });
  });

  describe('ownership', () => {
    it('transfers ownership and gates admin ops on the new owner', async () => {
      await expect(registry.transferOwnership(stranger.address))
        .to.emit(registry, 'OwnershipTransferred')
        .withArgs(owner.address, stranger.address);

      // previous owner can no longer administer
      await expect(
        registry.registerIdentity(walletA.address, Role.USER),
      ).to.be.revertedWithCustomError(registry, 'NotOwner');
      // new owner can
      await registry.connect(stranger).registerIdentity(walletA.address, Role.USER);
      expect(await registry.isActive(walletA.address)).to.equal(true);
    });

    it('rejects transferring ownership to the zero address', async () => {
      await expect(registry.transferOwnership(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        registry,
        'ZeroAddress',
      );
    });

    it('rejects ownership transfer from non-owners', async () => {
      await expect(
        registry.connect(stranger).transferOwnership(stranger.address),
      ).to.be.revertedWithCustomError(registry, 'NotOwner');
    });
  });
});
