// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    AccessControlDefaultAdminRules
} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Pausable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";

import {ICarbonCredit} from "./interfaces/ICarbonCredit.sol";

/// @title CarbonCredit
/// @author BlueRoot
/// @notice ERC-1155 verified blue-carbon contributions. One token id per (project, vintage year).
///         1 unit = 0.01 verified hectare-year of mangrove. Not a certified CO2 offset.
/// @dev - Only `VERIFICATION` (immutable, set at deployment) can issue: no role can ever be granted to
///        mint, even by a compromised admin.
///      - The buffer share is minted to `BUFFER_POOL`, an address with no known private key, and any
///        movement out of it is rejected: buffer credits are visible but can never be sold or retired.
///      - Retiring burns the credits, so a retired credit can never be transferred again.
contract CarbonCredit is ICarbonCredit, ERC1155Pausable, AccessControlDefaultAdminRules {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Address holding the non-transferable buffer pool.
    address public constant BUFFER_POOL = address(uint160(uint256(keccak256("blueroot.buffer.pool"))));

    string public constant name = "BlueRoot Verified Hectare-Year";
    string public constant symbol = "BRHY";

    /// @notice The Verification contract, sole issuer.
    address public immutable VERIFICATION;

    /// @notice Total ever issued (net + buffer) per token id.
    mapping(uint256 tokenId => uint256) public totalIssued;
    /// @notice Total ever retired (burned) per token id.
    mapping(uint256 tokenId => uint256) public totalRetired;
    /// @notice Number of retirements, used as certificate serial number.
    uint256 public retirementCount;

    error ZeroAddress();
    error ZeroAmount();
    error NotVerification(address caller);
    error BufferLocked();

    event CreditsIssued(
        uint256 indexed tokenId, uint256 indexed claimId, address indexed to, uint256 net, uint256 buffer
    );
    event CreditsRetired(
        uint256 indexed retirementId,
        address indexed account,
        uint256 indexed tokenId,
        uint256 amount,
        address beneficiary,
        bytes32 reasonHash
    );

    constructor(address admin, uint48 adminDelay, address verification, string memory uri_)
        ERC1155(uri_)
        AccessControlDefaultAdminRules(adminDelay, admin)
    {
        if (verification == address(0)) revert ZeroAddress();
        VERIFICATION = verification;
    }

    /// @inheritdoc ICarbonCredit
    function issue(address to, uint256 tokenId, uint256 claimId, uint256 net, uint256 buffer) external {
        if (msg.sender != VERIFICATION) revert NotVerification(msg.sender);
        if (net == 0) revert ZeroAmount();

        totalIssued[tokenId] += net + buffer;
        if (buffer != 0) _mint(BUFFER_POOL, tokenId, buffer, "");
        _mint(to, tokenId, net, "");

        emit CreditsIssued(tokenId, claimId, to, net, buffer);
    }

    /// @notice Permanently retire (burn) credits on behalf of `beneficiary`.
    /// @param tokenId Credit id (project + vintage).
    /// @param amount Units to retire (0.01 ha-year each).
    /// @param beneficiary Address on whose behalf the claim is made (no personal data on-chain).
    /// @param reasonHash Hash of the public retirement statement (IPFS document).
    /// @return retirementId Serial number of the certificate.
    function retire(uint256 tokenId, uint256 amount, address beneficiary, bytes32 reasonHash)
        external
        returns (uint256 retirementId)
    {
        if (amount == 0) revert ZeroAmount();
        if (beneficiary == address(0)) revert ZeroAddress();

        _burn(msg.sender, tokenId, amount);
        totalRetired[tokenId] += amount;
        unchecked {
            retirementId = ++retirementCount;
        }
        emit CreditsRetired(retirementId, msg.sender, tokenId, amount, beneficiary, reasonHash);
    }

    function setURI(string calldata newUri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newUri);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Buffer pool balance for `tokenId`.
    function bufferOf(uint256 tokenId) external view returns (uint256) {
        return balanceOf(BUFFER_POOL, tokenId);
    }

    /// @inheritdoc ICarbonCredit
    function encodeTokenId(uint256 projectId, uint256 vintage) external pure returns (uint256) {
        return (projectId << 16) | vintage;
    }

    /// @inheritdoc ICarbonCredit
    function projectOf(uint256 tokenId) external pure returns (uint256) {
        return tokenId >> 16;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControlDefaultAdminRules)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Blocks every movement out of the buffer pool (transfer or burn).
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        if (from == BUFFER_POOL) revert BufferLocked();
        super._update(from, to, ids, values);
    }
}
