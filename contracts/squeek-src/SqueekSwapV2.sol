// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC165V2 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC721SwapV2 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/// @title SqueekSwap V2
/// @notice Non-custodial atomic ERC-721 barter across admin-approved collections.
/// @dev The registry admin can only enable/disable collections. It cannot move assets,
///      change offers, charge a fee, pause unrelated collections, or upgrade this contract.
contract SqueekSwapV2 {
    bytes4 private constant ERC721_INTERFACE_ID = 0x80ac58cd;

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
        CollectionNotSupported,
        TakerMissingToken,
        TakerNotApproved,
        MakerMissingToken,
        MakerNotApproved
    }

    struct Asset {
        address collection;
        uint256 tokenId;
    }

    struct Offer {
        address maker;
        address taker;
        uint64 expiry;
        uint64 nonce;
        Asset[] give;
        Asset[] want;
    }

    struct Record {
        bytes32 hash;
        address maker;
        uint64 expiry;
        Status status;
    }

    mapping(uint256 id => Record) public records;
    mapping(address maker => uint64) public nonceOf;
    mapping(address collection => bool) public supportedCollection;
    mapping(address collection => bool) private knownCollection;
    address[] private collectionList;

    address public registryAdmin;
    address public pendingRegistryAdmin;
    uint256 public offerCount;
    uint256 private lockState = 1;

    event OfferCreated(uint256 indexed id, address indexed maker, address indexed taker, Offer offer);
    event OfferFilled(uint256 indexed id, address indexed taker);
    event OfferClosed(uint256 indexed id, address indexed maker, bool expired);
    event Revoked(address indexed maker, uint64 nonce);
    event CollectionSupportChanged(address indexed collection, bool supported);
    event RegistryAdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);
    event RegistryAdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    error BadConfig();
    error NotRegistryAdmin();
    error NotPendingRegistryAdmin();
    error BadCollection(address collection);
    error NotMaker();
    error SelfTrade();
    error BadExpiry();
    error BadItems();
    error BadNonce();
    error UnsupportedCollection(address collection);
    error NotOwner(address collection, uint256 tokenId);
    error BadWantedOwner(address collection, uint256 tokenId);
    error NotOpen();
    error NotExpired();
    error ReentrantCall();
    error TransferInvariantFailed(address collection, uint256 tokenId, address expectedOwner);
    error CannotFill(Reason reason);

    modifier onlyRegistryAdmin() {
        if (msg.sender != registryAdmin) revert NotRegistryAdmin();
        _;
    }

    modifier nonReentrant() {
        if (lockState != 1) revert ReentrantCall();
        lockState = 2;
        _;
        lockState = 1;
    }

    constructor(address initialRegistryAdmin, address[] memory initialCollections) {
        if (initialRegistryAdmin == address(0)) revert BadConfig();
        registryAdmin = initialRegistryAdmin;
        emit RegistryAdminTransferred(address(0), initialRegistryAdmin);
        for (uint256 i; i < initialCollections.length; ++i) {
            _setCollection(initialCollections[i], true);
        }
    }

    /// @notice Enables or disables a standards-compliant ERC-721 collection.
    /// @dev Disabling prevents new offers and fills involving the collection. It never moves an NFT.
    function setCollection(address collection, bool supported) external onlyRegistryAdmin {
        _setCollection(collection, supported);
    }

    /// @notice Applies one support state to several collections in one admin transaction.
    function setCollections(address[] calldata collections, bool supported) external onlyRegistryAdmin {
        for (uint256 i; i < collections.length; ++i) {
            _setCollection(collections[i], supported);
        }
    }

    function collectionCount() external view returns (uint256) {
        return collectionList.length;
    }

    function collectionAt(uint256 index) external view returns (address collection, bool supported) {
        collection = collectionList[index];
        supported = supportedCollection[collection];
    }

    /// @notice Starts a two-step registry-admin transfer. The new admin must accept.
    function transferRegistryAdmin(address newAdmin) external onlyRegistryAdmin {
        if (newAdmin == address(0) || newAdmin == registryAdmin) revert BadConfig();
        pendingRegistryAdmin = newAdmin;
        emit RegistryAdminTransferStarted(registryAdmin, newAdmin);
    }

    function acceptRegistryAdmin() external {
        if (msg.sender != pendingRegistryAdmin) revert NotPendingRegistryAdmin();
        address previous = registryAdmin;
        registryAdmin = msg.sender;
        pendingRegistryAdmin = address(0);
        emit RegistryAdminTransferred(previous, msg.sender);
    }

    /// @notice Creates an offer while every NFT remains in its current owner's wallet.
    function create(Offer calldata offer) external nonReentrant returns (uint256 id) {
        if (offer.maker != msg.sender) revert NotMaker();
        if (offer.taker == msg.sender) revert SelfTrade();
        if (offer.nonce != nonceOf[msg.sender]) revert BadNonce();
        if (offer.expiry <= block.timestamp || offer.expiry > block.timestamp + MAX_DURATION) revert BadExpiry();
        _checkShape(offer);

        for (uint256 i; i < offer.give.length; ++i) {
            Asset calldata asset = offer.give[i];
            _requireSupported(asset.collection);
            if (_ownerOf(asset) != msg.sender) revert NotOwner(asset.collection, asset.tokenId);
        }

        address wantedOwner;
        for (uint256 i; i < offer.want.length; ++i) {
            Asset calldata asset = offer.want[i];
            _requireSupported(asset.collection);
            address owner = _ownerOf(asset);
            if (owner == address(0)) revert BadWantedOwner(asset.collection, asset.tokenId);
            if (i == 0) wantedOwner = owner;
            else if (owner != wantedOwner) revert BadWantedOwner(asset.collection, asset.tokenId);
        }
        if (wantedOwner == msg.sender) revert SelfTrade();
        if (offer.taker != address(0) && wantedOwner != offer.taker) {
            Asset calldata firstWanted = offer.want[0];
            revert BadWantedOwner(firstWanted.collection, firstWanted.tokenId);
        }

        id = ++offerCount;
        records[id] = Record(keccak256(abi.encode(offer)), msg.sender, offer.expiry, Status.Open);
        emit OfferCreated(id, msg.sender, offer.taker, offer);
    }

    /// @notice Atomically exchanges every exact `(collection, tokenId)` pair in the offer.
    function fill(uint256 id, Offer calldata offer) external nonReentrant {
        Reason reason = _validate(id, offer, msg.sender);
        if (reason != Reason.Ok) revert CannotFill(reason);

        records[id].status = Status.Filled;
        for (uint256 i; i < offer.want.length; ++i) {
            Asset calldata asset = offer.want[i];
            IERC721SwapV2(asset.collection).transferFrom(msg.sender, offer.maker, asset.tokenId);
        }
        for (uint256 i; i < offer.give.length; ++i) {
            Asset calldata asset = offer.give[i];
            IERC721SwapV2(asset.collection).transferFrom(offer.maker, msg.sender, asset.tokenId);
        }

        // A registered collection must actually perform every requested transfer.
        for (uint256 i; i < offer.want.length; ++i) _requireOwner(offer.want[i], offer.maker);
        for (uint256 i; i < offer.give.length; ++i) _requireOwner(offer.give[i], msg.sender);
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
            Asset calldata asset = offer.want[i];
            if (!supportedCollection[asset.collection]) return Reason.CollectionNotSupported;
            if (_ownerOf(asset) != taker) return Reason.TakerMissingToken;
            if (!_approved(asset)) return Reason.TakerNotApproved;
        }
        for (uint256 i; i < offer.give.length; ++i) {
            Asset calldata asset = offer.give[i];
            if (!supportedCollection[asset.collection]) return Reason.CollectionNotSupported;
            if (_ownerOf(asset) != offer.maker) return Reason.MakerMissingToken;
            if (!_approved(asset)) return Reason.MakerNotApproved;
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
            for (uint256 j; j < i; ++j) if (_sameAsset(offer.give[i], offer.give[j])) revert BadItems();
            for (uint256 j; j < wantLength; ++j) if (_sameAsset(offer.give[i], offer.want[j])) revert BadItems();
        }
        for (uint256 i; i < wantLength; ++i) {
            for (uint256 j; j < i; ++j) if (_sameAsset(offer.want[i], offer.want[j])) revert BadItems();
        }
    }

    function _sameAsset(Asset calldata a, Asset calldata b) private pure returns (bool) {
        return a.collection == b.collection && a.tokenId == b.tokenId;
    }

    function _setCollection(address collection, bool supported) private {
        if (collection == address(0)) revert BadCollection(collection);
        if (supported) {
            if (collection.code.length == 0) revert BadCollection(collection);
            try IERC165V2(collection).supportsInterface(ERC721_INTERFACE_ID) returns (bool ok) {
                if (!ok) revert BadCollection(collection);
            } catch {
                revert BadCollection(collection);
            }
            if (!knownCollection[collection]) {
                knownCollection[collection] = true;
                collectionList.push(collection);
            }
        }
        supportedCollection[collection] = supported;
        emit CollectionSupportChanged(collection, supported);
    }

    function _requireSupported(address collection) private view {
        if (!supportedCollection[collection]) revert UnsupportedCollection(collection);
    }

    function _ownerOf(Asset calldata asset) private view returns (address) {
        try IERC721SwapV2(asset.collection).ownerOf(asset.tokenId) returns (address owner) {
            return owner;
        } catch {
            return address(0);
        }
    }

    /// @dev Only per-token approval is accepted. A standard ERC-721 clears it on transfer,
    ///      so an old offer cannot revive after the maker sells and later reacquires the NFT.
    function _approved(Asset calldata asset) private view returns (bool) {
        try IERC721SwapV2(asset.collection).getApproved(asset.tokenId) returns (address approved) {
            return approved == address(this);
        } catch {
            return false;
        }
    }

    function _requireOwner(Asset calldata asset, address expectedOwner) private view {
        if (_ownerOf(asset) != expectedOwner) {
            revert TransferInvariantFailed(asset.collection, asset.tokenId, expectedOwner);
        }
    }

    function _close(uint256 id, bool expired) private {
        Record storage record = records[id];
        if (record.status != Status.Open) revert NotOpen();
        record.status = Status.Closed;
        emit OfferClosed(id, record.maker, expired);
    }
}
