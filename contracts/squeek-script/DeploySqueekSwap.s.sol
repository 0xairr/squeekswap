// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {SqueekSwap, IERC721Swap} from "../squeek-src/SqueekSwap.sol";

interface ICanonicalSqueek is IERC721Swap {
    function MAXIMUM_LEVEL() external view returns (uint256);
    function mining() external view returns (address);
    function sqkCore() external view returns (address);
}

/// @notice Deploys only after checking the canonical Graph C collection identities.
contract DeploySqueekSwap is Script {
    address constant CANONICAL_SQUEEK = 0xCB98349c134aB983dA5BfD80527dfe2552bDB70F;
    address constant CANONICAL_MINING = 0xcd46990f8349057335289Ef282c276204B6CDC62;
    address constant CANONICAL_CORE = 0x980B4424c007CAf7a1f3670B48c8EaEf7EbC3d44;

    function run() external returns (SqueekSwap swap) {
        require(block.chainid == 11155111, "Squeekchain is Sepolia");
        address collection = vm.envOr("SQUEEK_NFT", CANONICAL_SQUEEK);
        ICanonicalSqueek squeek = ICanonicalSqueek(collection);
        require(squeek.MAXIMUM_LEVEL() == 10, "unexpected max level");
        require(squeek.mining() == CANONICAL_MINING, "unexpected mining contract");
        require(squeek.sqkCore() == CANONICAL_CORE, "unexpected core contract");

        vm.startBroadcast();
        swap = new SqueekSwap(squeek);
        vm.stopBroadcast();
        console.log("Squeek NFT ", collection);
        console.log("SqueekSwap ", address(swap));
    }
}
