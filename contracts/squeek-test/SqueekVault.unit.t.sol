// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "../lib/forge-std/src/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SqueekVault, ISqueekStaking} from "../squeek-src/SqueekVault.sol";
import {MockSQK, MockGenesis, MockOtherNFT, MockV2Factory, MockStaking} from "./VaultMocks.sol";

contract SqueekVaultTestBase is Test {
    MockSQK sqk;
    MockGenesis nft;
    MockStaking staking;
    MockV2Factory factory;
    SqueekVault vault;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address weth = makeAddr("weth");
    address poolManager = makeAddr("poolManager");
    address pair;

    uint256 constant L1 = 1000e18;
    uint256 constant L2 = 2200e18;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        sqk = new MockSQK();
        nft = new MockGenesis();
        staking = new MockStaking(nft, sqk);
        factory = new MockV2Factory();
        vault = new SqueekVault(
            "SqueekSwap Vault Squeek",
            "vSQUEEK",
            ISqueekStaking(address(staking)),
            address(factory),
            weth,
            poolManager,
            owner
        );
        pair = vault.pair();
        for (uint256 id = 1; id <= 6; ++id) nft.mint(alice, id, 1);
        nft.mint(alice, 7, 2);
        for (uint256 id = 11; id <= 14; ++id) nft.mint(bob, id, 1);
        vm.prank(alice);
        nft.setApprovalForAll(address(vault), true);
        vm.prank(bob);
        nft.setApprovalForAll(address(vault), true);
    }

    function _ids(uint256 a) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = a;
    }

    function _ids(uint256 a, uint256 b) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
    }

    function _lock(address who, uint256 id) internal {
        vm.prank(who);
        vault.lock(_ids(id));
    }

    function _pendingSqk(address who) internal view returns (uint256 s) {
        (s,) = vault.pendingRewards(who);
    }

    /// via_ir can cache `block.timestamp` inside a test, so read the clock from the VM.
    function _wait(uint256 secs) internal {
        vm.warp(vm.getBlockTimestamp() + secs);
    }
}

contract SqueekVaultLockTest is SqueekVaultTestBase {
    function test_LockMintsPowerAndStakes() public {
        vm.prank(alice);
        uint256 coins = vault.lock(_ids(1, 7));
        assertEq(coins, L1 + L2);
        assertEq(vault.balanceOf(alice), L1 + L2);
        assertEq(vault.totalSupply(), L1 + L2);
        assertEq(nft.ownerOf(1), address(staking));
        assertEq(staking.depositor(address(nft), 7), address(vault));
        (address by, uint256 power) = vault.lockInfo(7);
        assertEq(by, alice);
        assertEq(power, 2200);
        assertEq(vault.lockedCount(), 2);
    }

    function test_SafeTransferLocksForTheOwner() public {
        vm.prank(alice);
        nft.safeTransferFrom(alice, address(vault), 2);
        assertEq(vault.balanceOf(alice), L1);
        assertEq(nft.ownerOf(2), address(staking));
    }

    function test_SafeTransferByOperatorPaysTheOwner() public {
        vm.prank(alice);
        nft.approve(carol, 3);
        vm.prank(carol);
        nft.safeTransferFrom(alice, address(vault), 3);
        assertEq(vault.balanceOf(alice), L1);
        assertEq(vault.balanceOf(carol), 0);
    }

    function test_RejectsOtherCollections() public {
        MockOtherNFT other = new MockOtherNFT();
        other.mint(alice, 1);
        vm.prank(alice);
        vm.expectRevert();
        other.safeTransferFrom(alice, address(vault), 1);
    }

    function test_CannotLockSomeoneElsesSqueek() public {
        vm.prank(bob);
        vm.expectRevert();
        vault.lock(_ids(1));
    }

    function test_BatchLimits() public {
        vm.prank(alice);
        vm.expectRevert(SqueekVault.BadBatch.selector);
        vault.lock(new uint256[](0));
        vm.prank(alice);
        vm.expectRevert(SqueekVault.BadBatch.selector);
        vault.lock(new uint256[](101));
    }

    function test_LockRevertsWhileSqueekchainPaused() public {
        staking.setPaused(true);
        vm.prank(alice);
        vm.expectRevert();
        vault.lock(_ids(1));
    }

    function test_UnlockReturnsTheSqueekAndBurns() public {
        _lock(alice, 1);
        vm.prank(alice);
        vault.unlock(_ids(1));
        assertEq(nft.ownerOf(1), alice);
        assertEq(vault.totalSupply(), 0);
        assertEq(vault.lockedCount(), 0);
    }

    function test_AnyoneWithCoinsCanTakeAnySqueek() public {
        _lock(alice, 1);
        vm.prank(alice);
        vault.transfer(bob, L1);
        vm.prank(bob);
        vault.unlock(_ids(1));
        assertEq(nft.ownerOf(1), bob);
    }

    function test_UnlockNeedsTheCoins() public {
        _lock(alice, 7);
        vm.prank(alice);
        vault.transfer(bob, L1);
        vm.prank(alice);
        vm.expectRevert();
        vault.unlock(_ids(7));
    }

    function test_UnlockRejectsUnknownAndDuplicates() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SqueekVault.NotLocked.selector, 99));
        vault.unlock(_ids(99));
        vm.prank(alice);
        vault.lock(_ids(1, 2));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SqueekVault.NotLocked.selector, 1));
        vault.unlock(_ids(1, 1));
    }

    function test_UnlockWorksWhileSqueekchainPaused() public {
        _lock(alice, 1);
        staking.setPaused(true);
        vm.prank(alice);
        vault.unlock(_ids(1));
        assertEq(nft.ownerOf(1), alice);
    }

    function test_UnlockBurnsStoredPowerNotALiveRead() public {
        _lock(alice, 1);
        // Even if the level table changed later, the coins minted for #1 are what unlocking burns.
        vm.prank(alice);
        (uint256 coins,) = vault.unlock(_ids(1));
        assertEq(coins, L1);
    }

    function test_TransferToVaultReverts() public {
        _lock(alice, 1);
        vm.prank(alice);
        vm.expectRevert(SqueekVault.NoTransferToVault.selector);
        vault.transfer(address(vault), 1);
    }

    function test_LockedIdsPages() public {
        vm.prank(alice);
        vault.lock(_ids(1, 2));
        _lock(alice, 3);
        uint256[] memory page = vault.lockedIds(1, 5);
        assertEq(page.length, 2);
        assertEq(vault.lockedIds(9, 5).length, 0);
    }

    function test_PairIsTheUniswapV2Create2Address() public view {
        (address t0, address t1) = address(vault) < weth ? (address(vault), weth) : (weth, address(vault));
        bytes32 hash = keccak256(abi.encodePacked(
            hex"ff", address(factory), keccak256(abi.encodePacked(t0, t1)),
            hex"96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f"
        ));
        assertEq(vault.pair(), address(uint160(uint256(hash))));
        assertTrue(vault.isExcluded(vault.pair()));
        assertTrue(vault.isExcluded(poolManager));
        assertFalse(vault.isExcluded(alice));
    }
}

contract SqueekVaultRewardsTest is SqueekVaultTestBase {
    function test_SingleHolderGets75Percent() public {
        _lock(alice, 1);
        _wait(100);
        assertEq(_pendingSqk(alice), 75e18);
        vm.prank(alice);
        (uint256 got,) = vault.claim();
        assertEq(got, 75e18);
        assertEq(sqk.balanceOf(alice), 75e18);
        assertEq(vault.houseStaked(), 25e18);
    }

    function test_EarningFollowsTimeHeld() public {
        _lock(alice, 1);
        _wait(100);
        _lock(bob, 11);
        _wait(100);
        // Alice: 100 s alone (75) + 100 s at half (75). Bob: 100 s at half.
        assertEq(_pendingSqk(alice), 150e18);
        assertEq(_pendingSqk(bob), 75e18);
    }

    function test_TransferMidwaySplitsExactly() public {
        _lock(alice, 1);
        _wait(100);
        vm.prank(alice);
        vault.transfer(bob, L1 / 2);
        _wait(100);
        assertEq(_pendingSqk(alice), 75e18 + 37.5e18);
        assertEq(_pendingSqk(bob), 37.5e18);
    }

    function test_SellerKeepsEarningsAfterSelling() public {
        _lock(alice, 1);
        _wait(100);
        vm.prank(alice);
        vault.transfer(bob, L1);
        _wait(100);
        assertEq(_pendingSqk(alice), 75e18);
        vm.prank(alice);
        (uint256 got,) = vault.claim();
        assertEq(got, 75e18);
    }

    function test_PoolCoinsDoNotEarn() public {
        vm.prank(alice);
        vault.lock(_ids(1, 2));
        vm.prank(alice);
        vault.transfer(pair, L1);
        _wait(100);
        // Two Squeeks earn 200; holders' 150 all goes to Alice's 1,000 earning coins.
        assertEq(vault.earningSupply(), L1);
        assertEq(_pendingSqk(alice), 150e18);
        assertEq(_pendingSqk(vault.pair()), 0);
    }

    function test_CoinsHeldForZeroSecondsEarnNothing() public {
        vm.prank(alice);
        vault.lock(_ids(1, 2));
        vm.prank(alice);
        vault.transfer(pair, L1);
        _wait(100);
        // Flash-style: out of the pool and back in the same block.
        address p = pair;
        vm.prank(p);
        vault.transfer(bob, L1);
        vm.prank(bob);
        vault.transfer(p, L1);
        assertEq(_pendingSqk(bob), 0);
        assertEq(_pendingSqk(alice), 150e18);
    }

    function test_NobodyEarningSendsEverythingToTheHouse() public {
        _lock(alice, 1);
        vm.prank(alice);
        vault.transfer(pair, L1);
        _wait(100);
        vault.harvest();
        assertEq(vault.houseStaked(), 100e18);
        assertEq(vault.sqkReserved(), 0);
    }

    function test_HouseStakeUsesTheVaultMultiplier() public {
        for (uint256 id = 1; id <= 4; ++id) _lock(alice, id);
        _wait(40);
        vault.harvest(); // 4 SQK/s * 40 s = 160; house 40
        assertEq(vault.houseStaked(), 40e18);
        // 40 SQK with P = 4,000 gives 40 * (1000 + 4000) / (40 * 1000) = 5 power.
        assertEq(staking.weight(address(vault)), 4000e18 + 5e18);
    }

    function test_BrokenClaimableReadDoesNotBlockTransfers() public {
        _lock(alice, 1);
        _wait(100);
        vm.prank(alice);
        vault.transfer(bob, 1); // good read: Alice earns 75 for the first 100 s
        assertEq(_pendingSqk(alice), 75e18);
        _wait(100);
        staking.setMode(MockStaking.ClaimableMode.Revert);
        vm.prank(alice);
        vault.transfer(bob, L1 / 2);
        staking.setMode(MockStaking.ClaimableMode.BurnGas);
        vm.prank(bob);
        vault.transfer(carol, 1);
        staking.setMode(MockStaking.ClaimableMode.Normal);
        uint256 aliceBefore = _pendingSqk(alice);
        uint256 bobBefore = _pendingSqk(bob);
        // Bob bought in during the outage; the next good read must not hand him its SQK.
        vm.prank(bob);
        vault.transfer(carol, 1);
        assertEq(vault.houseOwed(), 25e18 + 100e18);
        assertEq(_pendingSqk(alice), aliceBefore);
        assertEq(_pendingSqk(bob), bobBefore);
    }

    function test_HugeReturnDataCannotGrief() public {
        _lock(alice, 1);
        staking.setMode(MockStaking.ClaimableMode.HugeReturn);
        _wait(100);
        vm.prank(alice);
        vault.transfer(bob, 1);
        assertEq(vault.balanceOf(bob), 1);
    }

    function test_CallerCannotForceASkippedCheckpointWithLowGas() public {
        _lock(alice, 1);
        _wait(100);
        vm.prank(alice);
        (bool ok,) = address(vault).call{gas: 60_000}(abi.encodeCall(vault.transfer, (bob, 1)));
        assertFalse(ok);
        assertEq(vault.accounted(), 0);
    }

    function test_HouseWaitsWhileSqueekchainPaused() public {
        _lock(alice, 1);
        _wait(100);
        staking.setPaused(true);
        vm.prank(alice);
        vault.claim();
        assertEq(sqk.balanceOf(alice), 75e18);
        assertEq(vault.houseOwed(), 25e18);
        assertEq(vault.houseStaked(), 0);
        staking.setPaused(false);
        vault.harvest();
        assertEq(vault.houseOwed(), 0);
        assertEq(vault.houseStaked(), 25e18);
    }

    function test_ClaimPaysWhatIsHereIfSqueekchainClaimFails() public {
        _lock(alice, 1);
        _lock(bob, 11);
        _wait(100);
        vault.harvest(); // 200 in: 150 reserved for holders, 50 staked
        _wait(100);
        staking.setClaimReverts(true);
        vm.prank(alice);
        (uint256 got,) = vault.claim();
        // Alice is owed 75 + ~75 but only 150 sits in the vault, shared with Bob's 75.
        assertEq(got, 150e18);
        assertEq(sqk.balanceOf(address(vault)), 0);
        staking.setClaimReverts(false);
        vm.prank(bob);
        (uint256 bobGot,) = vault.claim();
        assertGt(bobGot, 0);
    }
}

contract SqueekVaultFeeTest is SqueekVaultTestBase {
    function test_OnlyOwnerSchedulesWithinTheCap() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.scheduleUnlockFee(100);
        vm.prank(owner);
        vm.expectRevert(SqueekVault.FeeTooHigh.selector);
        vault.scheduleUnlockFee(501);
    }

    function test_FeeAppliesAfterTheDelay() public {
        vm.prank(owner);
        vault.scheduleUnlockFee(200);
        assertEq(vault.unlockFeeBps(), 0);
        _wait(3 days - 1);
        assertEq(vault.unlockFeeBps(), 0);
        _wait(1);
        assertEq(vault.unlockFeeBps(), 200);
    }

    function _feeOf(uint16 bps) internal {
        vm.prank(owner);
        vault.scheduleUnlockFee(bps);
        _wait(3 days);
    }

    function test_FeeGoesToHoldersAndOwnSqueekIsFree() public {
        _feeOf(200);
        _lock(alice, 1);
        _lock(bob, 11);
        _lock(bob, 12);
        _lock(bob, 13);
        // Bob takes Alice's #1: pays 2% of 1,000 = 20 coins.
        vm.prank(bob);
        (, uint256 fee) = vault.unlock(_ids(1));
        assertEq(fee, 20e18);
        // Earning coins after: Alice 1,000, Bob 3,000 - 1,000 - 20 = 1,980.
        (, uint256 aliceCoins) = vault.pendingRewards(alice);
        (, uint256 bobCoins) = vault.pendingRewards(bob);
        assertApproxEqAbs(aliceCoins, uint256(20e18) * 1000 / 2980, 1e6);
        assertApproxEqAbs(bobCoins, uint256(20e18) * 1980 / 2980, 1e6);
        assertLe(aliceCoins + bobCoins, 20e18);
        vm.prank(alice);
        (, uint256 claimedCoins) = vault.claim();
        assertEq(vault.balanceOf(alice), L1 + claimedCoins);
        // Bob takes back his own #11: no fee.
        vm.prank(bob);
        (, uint256 ownFee) = vault.unlock(_ids(11));
        assertEq(ownFee, 0);
    }

    function test_NoEarnersMeansNoFee() public {
        _feeOf(500);
        _lock(alice, 1);
        _lock(alice, 2);
        // Bob gets exactly #2's coins plus the fee; everything else sits in the pool.
        vm.prank(alice);
        vault.transfer(bob, 1050e18);
        vm.prank(alice);
        vault.transfer(pair, 950e18);
        vm.prank(bob);
        (, uint256 fee) = vault.unlock(_ids(2));
        assertEq(fee, 0);
        assertEq(vault.balanceOf(bob), 50e18);
    }

    function test_RenouncedOwnerFreezesTheFee() public {
        vm.prank(owner);
        vault.renounceOwnership();
        vm.prank(owner);
        vm.expectRevert();
        vault.scheduleUnlockFee(100);
    }
}
