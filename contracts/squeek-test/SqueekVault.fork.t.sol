// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "../lib/forge-std/src/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SqueekVault, ISqueekStaking} from "../squeek-src/SqueekVault.sol";

interface IGenesisFork {
    function ownerOf(uint256 tokenId) external view returns (address);
    function level(uint256 tokenId) external view returns (uint8);
    function approve(address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

interface IStakingFork is ISqueekStaking {
    function depositor(address collection, uint256 tokenId) external view returns (address);
    function accountPower(address account) external view returns (uint256 nftPower, uint256 sqkPower);
    function stakeOf(address account) external view returns (uint256 principal, uint256 fresh, uint64 freshUntil);
    function mining() external view returns (address);
    function fund(uint256 amount) external;
}

interface IRouterFork {
    function addLiquidityETH(address token, uint256 amount, uint256 minToken, uint256 minEth, address to, uint256 deadline)
        external
        payable
        returns (uint256, uint256, uint256);
    function swapExactETHForTokens(uint256 minOut, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory);
}

interface IFactoryFork {
    function getPair(address a, address b) external view returns (address);
}

/// @notice Acceptance test against live Squeekchain (Sepolia) and live Uniswap V2. Opt in with SQUEEK_FORK=1.
contract SqueekVaultForkTest is Test {
    IStakingFork constant STAKING = IStakingFork(0x50fd1780526C3186A0c037c7622203bC4fb611ca);
    IGenesisFork constant GENESIS = IGenesisFork(0xC4C7982657f00509548F3a3a41db7FA439a6856B);
    address constant V2_FACTORY = 0xF62c03E08ada871A0bEb309762E260a7a6a880E6;
    IRouterFork constant ROUTER = IRouterFork(0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3);
    address constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    address constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    SqueekVault vault;
    IERC20 sqk;
    address owner = makeAddr("owner");

    function setUp() public {
        if (!vm.envOr("SQUEEK_FORK", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(vm.envOr("SEPOLIA_RPC_URL", string("https://sepolia.gateway.tenderly.co")));
        // Load-balanced public RPCs may not all have the newest block yet; fork slightly behind head.
        vm.rollFork(block.number - 12);
        vault = new SqueekVault(
            "SqueekSwap Vault Squeek", "vSQUEEK", STAKING, V2_FACTORY, WETH, POOL_MANAGER, owner
        );
        sqk = IERC20(STAKING.token());
    }

    /// Level-1 Squeeks seen in wallets or staked on 2026-11-08; staked ones are withdrawn by their depositor.
    /// Each is moved to a fresh test wallet. Burned (merged) ones are skipped.
    function _squeeks(uint256 want) internal returns (uint256[] memory ids, address[] memory holders) {
        uint256[6] memory candidates = [uint256(8883), 8878, 27, 8884, 8877, 8876];
        ids = new uint256[](want);
        holders = new address[](want);
        uint256 found;
        for (uint256 c; c < candidates.length && found < want; ++c) {
            uint256 id = candidates[c];
            address holder;
            try GENESIS.ownerOf(id) returns (address o) {
                holder = o;
            } catch {
                continue;
            }
            if (GENESIS.level(id) != 1) continue;
            if (holder == address(STAKING)) {
                holder = STAKING.depositor(address(GENESIS), id);
                uint256[] memory single = new uint256[](1);
                single[0] = id;
                vm.prank(holder);
                STAKING.withdraw(address(GENESIS), single);
            }
            address to = makeAddr(string(abi.encodePacked("holder", vm.toString(found))));
            vm.prank(holder);
            GENESIS.safeTransferFrom(holder, to, id);
            ids[found] = id;
            holders[found] = to;
            ++found;
        }
        require(found == want, "not enough wallet Squeeks on the fork");
    }

    function _fund(uint256 amount) internal {
        deal(address(sqk), address(STAKING), sqk.balanceOf(address(STAKING)) + amount);
        vm.prank(STAKING.mining());
        STAKING.fund(amount);
    }

    function test_Fork_LockEarnClaimUnlock() public {
        (uint256[] memory ids, address[] memory holders) = _squeeks(2);
        address alice = holders[0];
        address bob = holders[1];

        // Alice locks with an approval; Bob locks in one safeTransferFrom.
        vm.startPrank(alice);
        GENESIS.approve(address(vault), ids[0]);
        uint256[] memory one = new uint256[](1);
        one[0] = ids[0];
        vault.lock(one);
        vm.stopPrank();
        vm.prank(bob);
        GENESIS.safeTransferFrom(bob, address(vault), ids[1]);

        assertEq(vault.balanceOf(alice), 1000e18);
        assertEq(vault.balanceOf(bob), 1000e18);
        assertEq(STAKING.depositor(address(GENESIS), ids[0]), address(vault));
        (uint256 nftPower,) = STAKING.accountPower(address(vault));
        assertEq(nftPower, 2000e18);

        // The claimable read must sit well inside the gas cap.
        uint256 g = gasleft();
        STAKING.claimable(address(vault));
        uint256 used = g - gasleft();
        console.log("claimable gas", used);
        assertLt(used, vault.CLAIMABLE_GAS() / 2);

        // A completed Squeek block streams over 1,200 s; let it run out.
        _fund(1_000_000e18);
        vm.warp(block.timestamp + 1_300);
        uint256 earned = STAKING.claimable(address(vault));
        assertGt(earned, 0);
        (uint256 alicePending,) = vault.pendingRewards(alice);
        (uint256 bobPending,) = vault.pendingRewards(bob);
        assertApproxEqAbs(alicePending, earned * 3 / 8, 1e6);
        assertApproxEqAbs(bobPending, earned * 3 / 8, 1e6);

        vm.prank(alice);
        (uint256 got,) = vault.claim();
        assertEq(sqk.balanceOf(alice), got);
        assertApproxEqAbs(got, earned * 3 / 8, 1e6);
        (uint256 principal,,) = STAKING.stakeOf(address(vault));
        assertEq(principal, vault.houseStaked());
        assertApproxEqAbs(principal, earned / 4, 1e6);
        (, uint256 sqkPower) = STAKING.accountPower(address(vault));
        assertGt(sqkPower, 0);

        // Bob takes Alice's Squeek with his coins; withdraw is free and instant.
        vm.prank(bob);
        vault.unlock(one);
        assertEq(GENESIS.ownerOf(ids[0]), bob);
        assertEq(STAKING.depositor(address(GENESIS), ids[0]), address(0));
        assertEq(vault.totalSupply(), 1000e18);
    }

    function test_Fork_OfficialPoolTradesAndNeverEarns() public {
        (uint256[] memory ids, address[] memory holders) = _squeeks(2);
        address seeder = holders[0];
        address buyer = makeAddr("buyer");
        vm.deal(seeder, 1 ether);
        vm.deal(buyer, 1 ether);
        vm.startPrank(seeder);
        GENESIS.safeTransferFrom(seeder, address(vault), ids[0]);
        vault.approve(address(ROUTER), 500e18);
        ROUTER.addLiquidityETH{value: 0.05 ether}(address(vault), 500e18, 0, 0, DEAD, block.timestamp);
        vm.stopPrank();
        address pair = vault.pair();
        assertEq(pair, IFactoryFork(V2_FACTORY).getPair(address(vault), WETH));
        assertEq(vault.balanceOf(pair), 500e18);
        assertEq(vault.earningSupply(), 500e18);

        // A router swap pays the buyer and runs the checkpoint inside the pair's transfer.
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = address(vault);
        vm.prank(buyer);
        ROUTER.swapExactETHForTokens{value: 0.01 ether}(0, path, buyer, block.timestamp);
        assertGt(vault.balanceOf(buyer), 0);

        _fund(1_000_000e18);
        vm.warp(block.timestamp + 1_300);
        (uint256 pairPending,) = vault.pendingRewards(pair);
        assertEq(pairPending, 0);
        (uint256 seederPending,) = vault.pendingRewards(seeder);
        (uint256 buyerPending,) = vault.pendingRewards(buyer);
        uint256 earned = STAKING.claimable(address(vault));
        // Only wallets earn: their shares add up to the holders' 75%.
        assertApproxEqAbs(seederPending + buyerPending, earned * 3 / 4, 1e9);
        ids;
    }
}
