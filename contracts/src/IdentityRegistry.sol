// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IdentityRegistry
 * @notice Authoritative on-chain source of application-level wallet authorization.
 *
 * Trust model:
 *  - SIWE proves control of a wallet key.
 *  - This contract decides whether that wallet is authorized to use the
 *    application and at which role tier (USER / OPERATOR / ADMIN).
 *  - The backend queries this contract on every authentication attempt; the
 *    database never overrides the contract's current state.
 *
 * Security properties enforced here:
 *  - administrative operations are restricted to the owner,
 *  - zero addresses are rejected,
 *  - duplicate registration of an active identity is rejected,
 *  - role NONE cannot be assigned (NONE is the "no authorization" state),
 *  - revoked identities report isActive == false and getRole == NONE,
 *  - every state transition emits an audit-friendly event.
 */
contract IdentityRegistry {
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    enum Role {
        NONE, // 0 - not authorized
        USER, // 1 - regular application user
        OPERATOR, // 2 - operational privileges
        ADMIN // 3 - administrative privileges
    }

    struct Identity {
        bool registered; // ever registered (historical record)
        bool active; // currently authorized
        Role role; // current role (NONE when inactive)
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    address public owner;

    mapping(address => Identity) private identities;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event IdentityRegistered(address indexed wallet, Role indexed role);
    event IdentityRevoked(address indexed wallet, Role indexed previousRole);
    event RoleChanged(address indexed wallet, Role indexed previousRole, Role indexed newRole);

    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------

    error NotOwner();
    error ZeroAddress();
    error InvalidRole();
    error AlreadyRegistered(address wallet);
    error NotRegistered(address wallet);
    error NotActive(address wallet);
    error RoleUnchanged(address wallet, Role role);

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------------
    // Construction
    // ------------------------------------------------------------------

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ------------------------------------------------------------------
    // Administrative operations
    // ------------------------------------------------------------------

    /**
     * @notice Registers a wallet with the given role.
     * @dev Re-registration of a *revoked* identity is allowed (it acts as a
     *      re-activation); registering an already active identity reverts.
     */
    function registerIdentity(address wallet, Role role) external onlyOwner {
        if (wallet == address(0)) revert ZeroAddress();
        if (role == Role.NONE) revert InvalidRole();

        Identity storage identity = identities[wallet];
        if (identity.registered && identity.active) revert AlreadyRegistered(wallet);

        Role previousRole = identity.role;
        identity.registered = true;
        identity.active = true;
        identity.role = role;

        emit IdentityRegistered(wallet, role);
        if (previousRole != role) {
            // Re-registration of a revoked identity is also a role transition.
            emit RoleChanged(wallet, previousRole, role);
        }
    }

    /**
     * @notice Revokes authorization for a wallet. The historical registration
     *         record is preserved, but the wallet immediately stops being
     *         active and its role becomes NONE.
     */
    function revokeIdentity(address wallet) external onlyOwner {
        if (wallet == address(0)) revert ZeroAddress();

        Identity storage identity = identities[wallet];
        if (!identity.registered) revert NotRegistered(wallet);
        if (!identity.active) revert NotActive(wallet);

        Role previousRole = identity.role;
        identity.active = false;
        identity.role = Role.NONE;

        emit IdentityRevoked(wallet, previousRole);
        emit RoleChanged(wallet, previousRole, Role.NONE);
    }

    /**
     * @notice Changes the role of an active identity.
     * @dev Use revokeIdentity to remove authorization entirely (role NONE).
     */
    function setRole(address wallet, Role role) external onlyOwner {
        if (wallet == address(0)) revert ZeroAddress();
        if (role == Role.NONE) revert InvalidRole();

        Identity storage identity = identities[wallet];
        if (!identity.registered) revert NotRegistered(wallet);
        if (!identity.active) revert NotActive(wallet);
        if (identity.role == role) revert RoleUnchanged(wallet, role);

        Role previousRole = identity.role;
        identity.role = role;

        emit RoleChanged(wallet, previousRole, role);
    }

    /**
     * @notice Transfers administrative control of the registry.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    // ------------------------------------------------------------------
    // Authorization queries (read by the backend)
    // ------------------------------------------------------------------

    function isRegistered(address wallet) external view returns (bool) {
        return identities[wallet].registered;
    }

    function isActive(address wallet) external view returns (bool) {
        Identity storage identity = identities[wallet];
        return identity.registered && identity.active;
    }

    function getRole(address wallet) external view returns (Role) {
        Identity storage identity = identities[wallet];
        if (!identity.registered || !identity.active) return Role.NONE;
        return identity.role;
    }

    /**
     * @notice Single round-trip view used by the backend authorization check.
     */
    function getIdentity(address wallet)
        external
        view
        returns (bool registered, bool active, Role role)
    {
        Identity storage identity = identities[wallet];
        registered = identity.registered;
        active = identity.registered && identity.active;
        role = active ? identity.role : Role.NONE;
    }
}
