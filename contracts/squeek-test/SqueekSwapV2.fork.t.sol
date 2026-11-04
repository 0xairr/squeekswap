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
    IGenesis constant GENESIS = IGenesis(0xCB98349c134aB983dA5BfD80527dfe2552bDB70F);
    address constant STAKING = 0x4b67b739dFd832f4EAC67a7Aa3bc244fB74cea4F;
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

    function _walletHeld(uint256 from) private view returns (uint256 id, address owner) {
        for (id = from; id < from + 200; ++id) {
            try GENESIS.ownerOf(id) returns (address o) {
                if (o != address(0) && o != STAKING && o.code.length == 0) return (id, o);
            } catch {}
        }
        revert("no wallet-held Genesis found");
    }

    function test_Fork_RealGenesisSwapSettlesAtomically() public {
        assertTrue(SWAP.supportedCollection(address(GENESIS)), "Genesis must be supported");
        assertFalse(GENESIS.paused(), "Genesis transfers are paused");
        (uint256 giveId, address maker) = _walletHeld(1);
        (uint256 wantId, address taker) = _walletHeld(giveId + 1);
        while (taker == maker) (wantId, taker) = _walletHeld(wantId + 1);
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
        (uint256 giveId, address maker) = _walletHeld(1);
        (uint256 wantId, address taker) = _walletHeld(giveId + 1);
        while (taker == maker) (wantId, taker) = _walletHeld(wantId + 1);
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

    function test_Fork_LookalikeCollectionIsNotSupported() public view {
        assertFalse(SWAP.supportedCollection(LOOKALIKE), "lookalike Squeek contract must be disabled");
    }
}
