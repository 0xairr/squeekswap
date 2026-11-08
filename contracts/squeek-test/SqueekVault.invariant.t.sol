// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "../lib/forge-std/src/Test.sol";
import {SqueekVault, ISqueekStaking} from "../squeek-src/SqueekVault.sol";
import {MockSQK, MockGenesis, MockV2Factory, MockStaking} from "./VaultMocks.sol";

contract VaultHandler is Test {
    SqueekVault public vault;
    MockGenesis public nft;
    MockStaking public staking;
    address public owner;
    address public pair;
    address[] public actors;
    uint256 public constant TOKENS = 30;

    uint256 public paidSqk;
    uint256 public paidCoins;
    /// One clock for handler calls and invariant checks.
    uint256 public time = 1_800_000_000;

    modifier synced() {
        vm.warp(time);
        _;
    }

    constructor(SqueekVault v, MockGenesis n, MockStaking s, address o, address[] memory a) {
        vault = v;
        nft = n;
        staking = s;
        owner = o;
        pair = v.pair();
        actors = a;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) private view returns (address) {
        return actors[seed % actors.length];
    }

    function _endpoint(uint256 seed) private view returns (address) {
        uint256 i = seed % (actors.length + 1);
        return i == actors.length ? pair : actors[i];
    }

    function _one(uint256 id) private pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = id;
    }

    function lock(uint256 actorSeed, uint256 tokenSeed) external synced {
        address a = _actor(actorSeed);
        uint256 id = 1 + tokenSeed % TOKENS;
        if (nft.ownerOf(id) != a || staking.paused()) return;
        vm.prank(a);
        vault.lock(_one(id));
    }

    function unlock(uint256 actorSeed, uint256 lockedSeed) external synced {
        uint256 n = vault.lockedCount();
        if (n == 0) return;
        uint256 id = vault.lockedIds(lockedSeed % n, 1)[0];
        (address by, uint256 power) = vault.lockInfo(id);
        address a = _actor(actorSeed);
        uint256 need = power * 1e18;
        if (by != a) need += power * 1e18 * vault.unlockFeeBps() / 10_000;
        if (vault.balanceOf(a) < need) return;
        vm.prank(a);
        vault.unlock(_one(id));
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external synced {
        address from = _endpoint(fromSeed);
        address to = _endpoint(toSeed);
        uint256 balance = vault.balanceOf(from);
        if (balance == 0) return;
        amount = bound(amount, 0, balance);
        vm.prank(from);
        vault.transfer(to, amount);
    }

    function claim(uint256 actorSeed) external synced {
        vm.prank(_actor(actorSeed));
        (uint256 s, uint256 c) = vault.claim();
        paidSqk += s;
        paidCoins += c;
    }

    function harvest() external synced {
        vault.harvest();
    }

    function wait(uint256 secs) external {
        time += bound(secs, 1, 3 days);
        vm.warp(time);
    }

    function setPaused(bool p) external synced {
        staking.setPaused(p);
    }

    function setReadBroken(bool broken) external synced {
        staking.setMode(broken ? MockStaking.ClaimableMode.Revert : MockStaking.ClaimableMode.Normal);
    }

    function setRate(uint256 r) external synced {
        staking.setRate(address(vault), bound(r, 0, 1e17));
    }

    function scheduleFee(uint16 bps) external synced {
        vm.prank(owner);
        vault.scheduleUnlockFee(uint16(bound(bps, 0, 500)));
    }
}

contract SqueekVaultInvariantTest is Test {
    SqueekVault vault;
    MockGenesis nft;
    MockStaking staking;
    MockSQK sqk;
    VaultHandler handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        sqk = new MockSQK();
        nft = new MockGenesis();
        staking = new MockStaking(nft, sqk);
        MockV2Factory factory = new MockV2Factory();
        address owner = makeAddr("owner");
        vault = new SqueekVault(
            "SqueekSwap Vault Squeek",
            "vSQUEEK",
            ISqueekStaking(address(staking)),
            address(factory),
            makeAddr("weth"),
            makeAddr("poolManager"),
            owner
        );
        address[] memory actors = new address[](4);
        for (uint256 i; i < 4; ++i) actors[i] = makeAddr(string(abi.encodePacked("actor", i)));
        for (uint256 id = 1; id <= 30; ++id) {
            address to = actors[id % 4];
            nft.mint(to, id, uint8(1 + id % 3));
        }
        for (uint256 i; i < 4; ++i) {
            vm.prank(actors[i]);
            nft.setApprovalForAll(address(vault), true);
        }
        handler = new VaultHandler(vault, nft, staking, owner, actors);
        targetContract(address(handler));
    }

    function invariant_SupplyEqualsLockedPower() public {
        vm.warp(handler.time());
        uint256 n = vault.lockedCount();
        uint256[] memory ids = vault.lockedIds(0, n);
        uint256 power;
        for (uint256 i; i < n; ++i) {
            (, uint256 p) = vault.lockInfo(ids[i]);
            power += p;
            assertEq(nft.ownerOf(ids[i]), address(staking));
            assertEq(staking.depositor(address(nft), ids[i]), address(vault));
        }
        assertEq(vault.totalSupply(), power * 1e18);
    }

    function invariant_EverySqkIsAccountedFor() public {
        vm.warp(handler.time());
        assertEq(
            vault.accounted(),
            handler.paidSqk() + vault.sqkReserved() + vault.houseOwed() + vault.houseStaked()
        );
    }

    function invariant_VaultCanCoverWhatItOwes() public {
        vm.warp(handler.time());
        uint256 have = sqk.balanceOf(address(vault)) + staking.claimableRaw(address(vault));
        assertGe(have, vault.sqkReserved() + vault.houseOwed());
        assertGe(vault.balanceOf(address(vault)), vault.coinReserved());
    }

    function invariant_HoldersNeverOwedMoreThanReserved() public {
        vm.warp(handler.time());
        uint256 earned = vault.harvested() + staking.claimableRaw(address(vault));
        uint256 unsplit = earned > vault.accounted() ? earned - vault.accounted() : 0;
        uint256 sqkOwed;
        uint256 coinOwed;
        for (uint256 i; i < handler.actorCount(); ++i) {
            (uint256 s, uint256 c) = vault.pendingRewards(handler.actors(i));
            sqkOwed += s;
            coinOwed += c;
        }
        assertLe(sqkOwed, vault.sqkReserved() + unsplit);
        assertLe(coinOwed, vault.coinReserved());
    }

    function invariant_EarningSupplyIsWhatActorsHold() public {
        vm.warp(handler.time());
        uint256 held;
        for (uint256 i; i < handler.actorCount(); ++i) held += vault.balanceOf(handler.actors(i));
        assertEq(vault.earningSupply(), held);
    }
}
