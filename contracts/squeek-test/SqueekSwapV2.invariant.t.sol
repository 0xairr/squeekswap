// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "../lib/forge-std/src/Test.sol";
import {StdInvariant} from "../lib/forge-std/src/StdInvariant.sol";
import {SqueekSwapV2} from "../squeek-src/SqueekSwapV2.sol";
import {MockSqueeks} from "../squeek-src/MockSqueeks.sol";

contract SqueekSwapV2Handler is Test {
    SqueekSwapV2 public swap;
    MockSqueeks public first;
    MockSqueeks public second;
    address[3] public actors;
    bytes[] public offers;
    mapping(uint256 id => bool) public filledBefore;
    bool public doubleFill;

    constructor(SqueekSwapV2 swap_, MockSqueeks first_, MockSqueeks second_, address[3] memory actors_) {
        swap = swap_;
        first = first_;
        second = second_;
        actors = actors_;
    }

    function create(uint256 makerSeed, uint256 takerSeed, uint256 giveSeed, uint256 wantSeed, bool crossCollection)
        external
    {
        address maker = actors[makerSeed % actors.length];
        address holder = actors[takerSeed % actors.length];
        if (maker == holder) return;
        MockSqueeks giveCollection = crossCollection ? second : first;
        uint256 giveId = _ownedToken(giveCollection, maker, giveSeed);
        uint256 wantId = _ownedToken(first, holder, wantSeed);
        if (giveId == 0 || wantId == 0) return;

        SqueekSwapV2.Asset[] memory give = new SqueekSwapV2.Asset[](1);
        SqueekSwapV2.Asset[] memory want = new SqueekSwapV2.Asset[](1);
        give[0] = SqueekSwapV2.Asset(address(giveCollection), giveId);
        want[0] = SqueekSwapV2.Asset(address(first), wantId);
        SqueekSwapV2.Offer memory offer = SqueekSwapV2.Offer({
            maker: maker,
            taker: holder,
            expiry: uint64(block.timestamp + 1 days),
            nonce: swap.nonceOf(maker),
            give: give,
            want: want
        });
        vm.prank(maker);
        try swap.create(offer) returns (uint256) {
            offers.push(abi.encode(offer));
        } catch {}
    }

    function fill(uint256 offerSeed) external {
        if (offers.length == 0) return;
        uint256 id = offerSeed % offers.length + 1;
        SqueekSwapV2.Offer memory offer = abi.decode(offers[id - 1], (SqueekSwapV2.Offer));
        vm.prank(offer.taker);
        try swap.fill(id, offer) {
            if (filledBefore[id]) doubleFill = true;
            filledBefore[id] = true;
        } catch {}
    }

    function cancel(uint256 offerSeed) external {
        if (offers.length == 0) return;
        uint256 id = offerSeed % offers.length + 1;
        SqueekSwapV2.Offer memory offer = abi.decode(offers[id - 1], (SqueekSwapV2.Offer));
        vm.prank(offer.maker);
        try swap.cancel(id) {} catch {}
    }

    function revoke(uint256 actorSeed) external {
        vm.prank(actors[actorSeed % actors.length]);
        swap.revokeAll();
    }

    function transfer(uint256 collectionSeed, uint256 tokenSeed, uint256 receiverSeed) external {
        MockSqueeks collection = collectionSeed % 2 == 0 ? first : second;
        uint256 tokenId = tokenSeed % 12 + 1;
        address owner = collection.ownerOf(tokenId);
        address receiver = actors[receiverSeed % actors.length];
        if (owner == receiver) return;
        vm.prank(owner);
        collection.transferFrom(owner, receiver, tokenId);
    }

    function _ownedToken(MockSqueeks collection, address owner, uint256 seed) private view returns (uint256) {
        uint256 balance = collection.balanceOf(owner);
        if (balance == 0) return 0;
        return collection.tokenOfOwnerByIndex(owner, seed % balance);
    }
}

contract SqueekSwapV2InvariantTest is StdInvariant, Test {
    MockSqueeks first;
    MockSqueeks second;
    SqueekSwapV2 swap;
    SqueekSwapV2Handler handler;

    function setUp() public {
        first = new MockSqueeks();
        second = new MockSqueeks();
        address[] memory initial = new address[](2);
        initial[0] = address(first);
        initial[1] = address(second);
        swap = new SqueekSwapV2(address(this), initial);
        address[3] memory actors = [makeAddr("alice"), makeAddr("bob"), makeAddr("carol")];
        for (uint256 i; i < actors.length; ++i) {
            first.mint(actors[i], 4);
            second.mint(actors[i], 4);
            for (uint256 tokenId = i * 4 + 1; tokenId <= i * 4 + 4; ++tokenId) {
                vm.prank(actors[i]);
                first.approve(address(swap), tokenId);
                vm.prank(actors[i]);
                second.approve(address(swap), tokenId);
            }
        }
        handler = new SqueekSwapV2Handler(swap, first, second, actors);
        targetContract(address(handler));
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 100
    function invariant_swapNeverCustodiesNFTs() public view {
        assertEq(first.balanceOf(address(swap)), 0);
        assertEq(second.balanceOf(address(swap)), 0);
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 100
    function invariant_noOfferFillsTwice() public view {
        assertFalse(handler.doubleFill());
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 100
    function invariant_supplyIsConservedAcrossCollections() public view {
        assertEq(first.totalSupply(), 12);
        assertEq(second.totalSupply(), 12);
    }
}
