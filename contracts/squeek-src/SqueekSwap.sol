// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC721Swap {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/// @title SqueekSwap
/// @notice Non-custodial, atomic barter for the canonical Squeek NFT collection.
/// @dev There is no owner, fee, escrow, upgrade path, or native-token transfer.
contract SqueekSwap {
    IERC721Swap public immutable SQUEEKS;

    uint256 public constant MAX_ITEMS = 8;
    uint256 public constant MAX_DURATION = 90 days;

    enum Status {
        None,
        Open,
        Filled,
        Closed
    }

    enum Reason {
        Ok,
        NotOpen,
        WrongOffer,
        Expired,
        Revoked,
        TakerNotAllowed,
        TakerMissingToken,
        TakerNotApproved,
        MakerMissingToken,
        MakerNotApproved
    }

    struct Offer {
        address maker;
        address taker;
        uint64 expiry;
        uint64 nonce;
        uint256[] give;
        uint256[] want;
    }

    struct Record {
        bytes32 hash;
        address maker;
        uint64 expiry;
        Status status;
    }

    mapping(uint256 id => Record) public records;
    mapping(address maker => uint64) public nonceOf;
    uint256 public offerCount;

    event OfferCreated(uint256 indexed id, address indexed maker, address indexed taker, Offer offer);
    event OfferFilled(uint256 indexed id, address indexed taker);
    event OfferClosed(uint256 indexed id, address indexed maker, bool expired);
    event Revoked(address indexed maker, uint64 nonce);

    error BadConfig();
    error NotMaker();
    error SelfTrade();
    error BadExpiry();
    error BadItems();
    error BadNonce();
    error NotOwner(uint256 tokenId);
    error NotOpen();
    error NotExpired();
    error CannotFill(Reason reason);

    constructor(IERC721Swap squeeks) {
        if (address(squeeks) == address(0)) revert BadConfig();
        SQUEEKS = squeeks;
    }

    /// @notice Creates an offer. Squeeks remain in the maker's wallet.
    function create(Offer calldata offer) external returns (uint256 id) {
        if (offer.maker != msg.sender) revert NotMaker();
        if (offer.taker == msg.sender) revert SelfTrade();
        if (offer.nonce != nonceOf[msg.sender]) revert BadNonce();
        if (offer.expiry <= block.timestamp || offer.expiry > block.timestamp + MAX_DURATION) revert BadExpiry();
        _checkShape(offer);

        for (uint256 i; i < offer.give.length; ++i) {
            if (_ownerOf(offer.give[i]) != msg.sender) revert NotOwner(offer.give[i]);
        }

        id = ++offerCount;
        records[id] = Record(keccak256(abi.encode(offer)), msg.sender, offer.expiry, Status.Open);
        emit OfferCreated(id, msg.sender, offer.taker, offer);
    }

    /// @notice Atomically exchanges the exact Squeeks named in an offer.
    function fill(uint256 id, Offer calldata offer) external {
        Reason reason = _validate(id, offer, msg.sender);
        if (reason != Reason.Ok) revert CannotFill(reason);

        records[id].status = Status.Filled;
        for (uint256 i; i < offer.want.length; ++i) {
            SQUEEKS.transferFrom(msg.sender, offer.maker, offer.want[i]);
        }
        for (uint256 i; i < offer.give.length; ++i) {
            SQUEEKS.transferFrom(offer.maker, msg.sender, offer.give[i]);
        }
        emit OfferFilled(id, msg.sender);
    }

    function cancel(uint256 id) external {
        Record storage record = records[id];
        if (msg.sender != record.maker) revert NotMaker();
        _close(id, false);
    }

    /// @notice Anyone may close an expired offer so indexers can stop presenting it as live.
    function reclaim(uint256 id) external {
        if (block.timestamp <= records[id].expiry) revert NotExpired();
        _close(id, true);
    }

    /// @notice Invalidates every currently open offer made by the caller in one transaction.
    function revokeAll() external {
        emit Revoked(msg.sender, ++nonceOf[msg.sender]);
    }

    /// @notice Returns the contract's current fill verdict without changing state.
    function check(uint256 id, Offer calldata offer, address taker) external view returns (Reason) {
        return _validate(id, offer, taker);
    }

    function _validate(uint256 id, Offer calldata offer, address taker) private view returns (Reason) {
        Record storage record = records[id];
        if (record.status != Status.Open) return Reason.NotOpen;
        if (record.hash != keccak256(abi.encode(offer))) return Reason.WrongOffer;
        if (block.timestamp > offer.expiry) return Reason.Expired;
        if (offer.nonce != nonceOf[offer.maker]) return Reason.Revoked;
        if (taker == offer.maker || (offer.taker != address(0) && taker != offer.taker)) {
            return Reason.TakerNotAllowed;
        }

        for (uint256 i; i < offer.want.length; ++i) {
            uint256 tokenId = offer.want[i];
            if (_ownerOf(tokenId) != taker) return Reason.TakerMissingToken;
            if (!_approved(taker, tokenId)) return Reason.TakerNotApproved;
        }
        for (uint256 i; i < offer.give.length; ++i) {
            uint256 tokenId = offer.give[i];
            if (_ownerOf(tokenId) != offer.maker) return Reason.MakerMissingToken;
            if (!_approved(offer.maker, tokenId)) return Reason.MakerNotApproved;
        }
        return Reason.Ok;
    }

    function _checkShape(Offer calldata offer) private pure {
        uint256 giveLength = offer.give.length;
        uint256 wantLength = offer.want.length;
        if (giveLength == 0 || wantLength == 0 || giveLength > MAX_ITEMS || wantLength > MAX_ITEMS) {
            revert BadItems();
        }
        for (uint256 i; i < giveLength; ++i) {
            for (uint256 j; j < i; ++j) if (offer.give[i] == offer.give[j]) revert BadItems();
            for (uint256 j; j < wantLength; ++j) if (offer.give[i] == offer.want[j]) revert BadItems();
        }
        for (uint256 i; i < wantLength; ++i) {
            for (uint256 j; j < i; ++j) if (offer.want[i] == offer.want[j]) revert BadItems();
        }
    }

    function _ownerOf(uint256 tokenId) private view returns (address) {
        try SQUEEKS.ownerOf(tokenId) returns (address owner) {
            return owner;
        } catch {
            return address(0);
        }
    }

    function _approved(address owner, uint256 tokenId) private view returns (bool) {
        return SQUEEKS.getApproved(tokenId) == address(this) || SQUEEKS.isApprovedForAll(owner, address(this));
    }

    function _close(uint256 id, bool expired) private {
        Record storage record = records[id];
        if (record.status != Status.Open) revert NotOpen();
        record.status = Status.Closed;
        emit OfferClosed(id, record.maker, expired);
    }
}
