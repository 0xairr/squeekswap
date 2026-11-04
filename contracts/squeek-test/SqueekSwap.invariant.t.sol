// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "../lib/forge-std/src/Test.sol";
import {StdInvariant} from "../lib/forge-std/src/StdInvariant.sol";
import {SqueekSwap, IERC721Swap} from "../squeek-src/SqueekSwap.sol";
import {MockSqueeks} from "../squeek-src/MockSqueeks.sol";

contract SqueekSwapHandler is Test {
    SqueekSwap public swap;
    MockSqueeks public squeeks;
    address[3] public actors;
    bytes[] public offers;
    mapping(uint256 id => bool) public filledBefore;
    bool public doubleFill;

    constructor(SqueekSwap swap_, MockSqueeks squeeks_, address[3] memory actors_) {
        swap = swap_;
        squeeks = squeeks_;
        actors = actors_;
    }

    function create(uint256 makerSeed, uint256 takerSeed, uint256 giveSeed, uint256 wantSeed, bool publicOffer)
        external
    {
        address maker = actors[makerSeed % actors.length];
        address holder = actors[takerSeed % actors.length];
        if (maker == holder) return;
        uint256 giveId = _ownedToken(maker, giveSeed);
        uint256 wantId = _ownedToken(holder, wantSeed);
        if (giveId == 0 || wantId == 0) return;

        uint256[] memory give = new uint256[](1);
        uint256[] memory want = new uint256[](1);
        give[0] = giveId;
        want[0] = wantId;
        SqueekSwap.Offer memory offer = SqueekSwap.Offer({
            maker: maker,
            taker: publicOffer ? address(0) : holder,
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

    function fill(uint256 offerSeed, uint256 actorSeed) external {
        if (offers.length == 0) return;
        uint256 id = offerSeed % offers.length + 1;
        SqueekSwap.Offer memory offer = abi.decode(offers[id - 1], (SqueekSwap.Offer));
        address taker = offer.taker == address(0) ? actors[actorSeed % actors.length] : offer.taker;
        vm.prank(taker);
        try swap.fill(id, offer) {
            if (filledBefore[id]) doubleFill = true;
            filledBefore[id] = true;
        } catch {}
    }

    function cancel(uint256 offerSeed) external {
        if (offers.length == 0) return;
        uint256 id = offerSeed % offers.length + 1;
        SqueekSwap.Offer memory offer = abi.decode(offers[id - 1], (SqueekSwap.Offer));
        vm.prank(offer.maker);
        try swap.cancel(id) {} catch {}
    }

    function revoke(uint256 actorSeed) external {
        vm.prank(actors[actorSeed % actors.length]);
        swap.revokeAll();
    }

    function transfer(uint256 tokenSeed, uint256 receiverSeed) external {
        uint256 tokenId = tokenSeed % 12 + 1;
        address owner = squeeks.ownerOf(tokenId);
        address receiver = actors[receiverSeed % actors.length];
        if (owner == receiver) return;
        vm.prank(owner);
        squeeks.transferFrom(owner, receiver, tokenId);
    }

    function _ownedToken(address owner, uint256 seed) private view returns (uint256) {
        uint256 balance = squeeks.balanceOf(owner);
        if (balance == 0) return 0;
        return squeeks.tokenOfOwnerByIndex(owner, seed % balance);
    }
}

contract SqueekSwapInvariantTest is StdInvariant, Test {
    MockSqueeks squeeks;
    SqueekSwap swap;
    SqueekSwapHandler handler;

    function setUp() public {
        squeeks = new MockSqueeks();
        swap = new SqueekSwap(IERC721Swap(address(squeeks)));
        address[3] memory actors = [makeAddr("alice"), makeAddr("bob"), makeAddr("carol")];
        for (uint256 i; i < actors.length; ++i) {
            squeeks.mint(actors[i], 4);
            vm.prank(actors[i]);
            squeeks.setApprovalForAll(address(swap), true);
        }
        handler = new SqueekSwapHandler(swap, squeeks, actors);
        targetContract(address(handler));
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 100
    function invariant_swapNeverCustodiesSqueeks() public view {
        assertEq(squeeks.balanceOf(address(swap)), 0);
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 100
    function invariant_noOfferFillsTwice() public view {
        assertFalse(handler.doubleFill());
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 100
    function invariant_supplyIsConserved() public view {
        assertEq(squeeks.totalSupply(), 12);
    }
}
