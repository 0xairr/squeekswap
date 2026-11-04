// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "../lib/forge-std/src/Test.sol";
import {SqueekSwapV2} from "../squeek-src/SqueekSwapV2.sol";

interface IGenesis {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function approve(address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function level(uint256 tokenId) external view returns (uint8);
    function paused() external view returns (bool);
}

/// @notice Acceptance test against the live Sepolia deployment and the real Squeek Genesis contract.
/// Opt in with SQUEEK_FORK=1 (optionally SEPOLIA_RPC_URL). Nothing is broadcast: the fork is local.
contract SqueekSwapV2ForkTest is Test {
    SqueekSwapV2 constant SWAP = SqueekSwapV2(0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5);
    // Squeekchain relaunched on 2026-11-03 (installation sepolia-core-sepolia-20261103) with a new Genesis.
    IGenesis constant GENESIS = IGenesis(0xC4C7982657f00509548F3a3a41db7FA439a6856B);
    address constant RETIRED_GENESIS = 0xCB98349c134aB983dA5BfD80527dfe2552bDB70F;
    address constant LOOKALIKE = 0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6;

    function setUp() public {
        if (!vm.envOr("SQUEEK_FORK", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(vm.envOr("SEPOLIA_RPC_URL", string("https://ethereum-sepolia-rpc.publicnode.com")));
        // Load-balanced public RPCs may not all have the newest block yet; fork slightly behind head.
        vm.rollFork(block.number - 12);
    }

    /// Before claims open nearly every Genesis sits with Squeekchain's dispenser or signer, so move two real
    /// tokens to fresh wallets with real transfers. This also proves plain wallet-to-wallet transfers work.
    function _dealt(uint256 id, string memory name) private returns (uint256, address to) {
        to = makeAddr(name);
        address holder = GENESIS.ownerOf(id);
        vm.prank(holder);
        GENESIS.transferFrom(holder, to, id);
        assertEq(GENESIS.ownerOf(id), to);
        return (id, to);
    }

    function test_Fork_RealGenesisSwapSettlesAtomically() public {
        assertTrue(SWAP.supportedCollection(address(GENESIS)), "Genesis must be supported");
        assertFalse(GENESIS.paused(), "Genesis transfers are paused");
        (uint256 giveId, address maker) = _dealt(420, "maker");
        (uint256 wantId, address taker) = _dealt(9999, "taker");
        uint8 giveLevel = GENESIS.level(giveId);
        uint8 wantLevel = GENESIS.level(wantId);

        SqueekSwapV2.Asset[] memory give = new SqueekSwapV2.Asset[](1);
        give[0] = SqueekSwapV2.Asset(address(GENESIS), giveId);
        SqueekSwapV2.Asset[] memory want = new SqueekSwapV2.Asset[](1);
        want[0] = SqueekSwapV2.Asset(address(GENESIS), wantId);
        SqueekSwapV2.Offer memory offer =
            SqueekSwapV2.Offer(maker, taker, uint64(block.timestamp + 1 days), SWAP.nonceOf(maker), give, want);

        vm.prank(maker);
        uint256 id = SWAP.create(offer);
        // The wanted side is validated first.
        assertEq(uint8(SWAP.check(id, offer, taker)), uint8(SqueekSwapV2.Reason.TakerNotApproved));

        vm.prank(taker);
        GENESIS.approve(address(SWAP), wantId);
        assertEq(uint8(SWAP.check(id, offer, taker)), uint8(SqueekSwapV2.Reason.MakerNotApproved));
        vm.prank(maker);
        GENESIS.approve(address(SWAP), giveId);
        assertEq(uint8(SWAP.check(id, offer, taker)), uint8(SqueekSwapV2.Reason.Ok));

        vm.prank(taker);
        SWAP.fill(id, offer);

        assertEq(GENESIS.ownerOf(giveId), taker);
        assertEq(GENESIS.ownerOf(wantId), maker);
        // The real Genesis contract must clear per-token approval on transfer (stale-offer defence).
        assertEq(GENESIS.getApproved(giveId), address(0));
        assertEq(GENESIS.getApproved(wantId), address(0));
        // Levels travel with the token.
        assertEq(GENESIS.level(giveId), giveLevel);
        assertEq(GENESIS.level(wantId), wantLevel);
        (,,, SqueekSwapV2.Status status) = SWAP.records(id);
        assertEq(uint8(status), uint8(SqueekSwapV2.Status.Filled));
    }

    function test_Fork_StaleApprovalDoesNotReviveAfterRoundTrip() public {
        (uint256 giveId, address maker) = _dealt(420, "maker");
        (uint256 wantId, address taker) = _dealt(9999, "taker");
        SqueekSwapV2.Asset[] memory give = new SqueekSwapV2.Asset[](1);
        give[0] = SqueekSwapV2.Asset(address(GENESIS), giveId);
        SqueekSwapV2.Asset[] memory want = new SqueekSwapV2.Asset[](1);
        want[0] = SqueekSwapV2.Asset(address(GENESIS), wantId);
        SqueekSwapV2.Offer memory offer =
            SqueekSwapV2.Offer(maker, address(0), uint64(block.timestamp + 1 days), SWAP.nonceOf(maker), give, want);
        vm.startPrank(maker);
        uint256 id = SWAP.create(offer);
        GENESIS.approve(address(SWAP), giveId);
        address parking = makeAddr("parking");
        GENESIS.transferFrom(maker, parking, giveId);
        vm.stopPrank();
        vm.prank(parking);
        GENESIS.transferFrom(parking, maker, giveId);
        vm.prank(taker);
        GENESIS.approve(address(SWAP), wantId);
        assertEq(uint8(SWAP.check(id, offer, taker)), uint8(SqueekSwapV2.Reason.MakerNotApproved));
    }

    function test_Fork_OnlyCurrentGenesisIsSupported() public view {
        assertTrue(SWAP.supportedCollection(address(GENESIS)), "current Genesis must be supported");
        assertFalse(SWAP.supportedCollection(RETIRED_GENESIS), "retired Genesis must be disabled");
        assertFalse(SWAP.supportedCollection(LOOKALIKE), "lookalike Squeek contract must be disabled");
        assertEq(SWAP.collectionCount(), 3);
    }

    /// A retired-collection offer must be refused at creation, even with the same name and token IDs.
    function test_Fork_RetiredGenesisOfferIsRefused() public {
        address maker = IGenesis(RETIRED_GENESIS).ownerOf(1);
        SqueekSwapV2.Asset[] memory give = new SqueekSwapV2.Asset[](1);
        give[0] = SqueekSwapV2.Asset(RETIRED_GENESIS, 1);
        SqueekSwapV2.Asset[] memory want = new SqueekSwapV2.Asset[](1);
        want[0] = SqueekSwapV2.Asset(address(GENESIS), 420);
        SqueekSwapV2.Offer memory offer =
            SqueekSwapV2.Offer(maker, address(0), uint64(block.timestamp + 1 days), SWAP.nonceOf(maker), give, want);
        vm.prank(maker);
        vm.expectRevert(abi.encodeWithSelector(SqueekSwapV2.UnsupportedCollection.selector, RETIRED_GENESIS));
        SWAP.create(offer);
    }
}
