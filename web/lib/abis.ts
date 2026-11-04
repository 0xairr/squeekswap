import { parseAbi } from 'viem'

// OpenZeppelin v5 ERC-721 errors (used by the official Genesis contract). They can surface from approve()
// directly or bubble up from transferFrom() inside fill(), so both ABIs carry them.
const ERC721_ERRORS = [
  'error ERC721NonexistentToken(uint256 tokenId)',
  'error ERC721IncorrectOwner(address sender,uint256 tokenId,address owner)',
  'error ERC721InsufficientApproval(address operator,uint256 tokenId)',
  'error ERC721InvalidApprover(address approver)',
  'error ERC721InvalidOperator(address operator)',
  'error EnforcedPause()',
] as const

export const swapAbi = parseAbi([
  'function MAX_ITEMS() view returns (uint256)',
  'function MAX_DURATION() view returns (uint256)',
  'function offerCount() view returns (uint256)',
  'function registryAdmin() view returns (address)',
  'function pendingRegistryAdmin() view returns (address)',
  'function supportedCollection(address collection) view returns (bool)',
  'function collectionCount() view returns (uint256)',
  'function collectionAt(uint256 index) view returns (address collection,bool supported)',
  'function nonceOf(address maker) view returns (uint64)',
  'function records(uint256 id) view returns (bytes32 hash, address maker, uint64 expiry, uint8 status)',
  'function create((address maker,address taker,uint64 expiry,uint64 nonce,(address collection,uint256 tokenId)[] give,(address collection,uint256 tokenId)[] want) offer) returns (uint256 id)',
  'function fill(uint256 id,(address maker,address taker,uint64 expiry,uint64 nonce,(address collection,uint256 tokenId)[] give,(address collection,uint256 tokenId)[] want) offer)',
  'function cancel(uint256 id)',
  'function reclaim(uint256 id)',
  'function revokeAll()',
  'function check(uint256 id,(address maker,address taker,uint64 expiry,uint64 nonce,(address collection,uint256 tokenId)[] give,(address collection,uint256 tokenId)[] want) offer,address taker) view returns (uint8)',
  'event OfferCreated(uint256 indexed id,address indexed maker,address indexed taker,(address maker,address taker,uint64 expiry,uint64 nonce,(address collection,uint256 tokenId)[] give,(address collection,uint256 tokenId)[] want) offer)',
  'event OfferFilled(uint256 indexed id,address indexed taker)',
  'event OfferClosed(uint256 indexed id,address indexed maker,bool expired)',
  'event Revoked(address indexed maker,uint64 nonce)',
  'event CollectionSupportChanged(address indexed collection,bool supported)',
  // Every custom error the deployed contract can revert with, so viem can decode and name it.
  'error BadConfig()',
  'error NotRegistryAdmin()',
  'error NotPendingRegistryAdmin()',
  'error BadCollection(address collection)',
  'error NotMaker()',
  'error SelfTrade()',
  'error BadExpiry()',
  'error BadItems()',
  'error BadNonce()',
  'error UnsupportedCollection(address collection)',
  'error NotOwner(address collection,uint256 tokenId)',
  'error BadWantedOwner(address collection,uint256 tokenId)',
  'error NotOpen()',
  'error NotExpired()',
  'error ReentrantCall()',
  'error TransferInvariantFailed(address collection,uint256 tokenId,address expectedOwner)',
  'error CannotFill(uint8 reason)',
  ...ERC721_ERRORS,
])

export const erc721Abi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner,address operator) view returns (bool)',
  'function approve(address to,uint256 tokenId)',
  'function setApprovalForAll(address operator,bool approved)',
  ...ERC721_ERRORS,
])

export const squeekAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner,address operator) view returns (bool)',
  'function approve(address to,uint256 tokenId)',
  'function setApprovalForAll(address operator,bool approved)',
  'function level(uint256 tokenId) view returns (uint8)',
])
