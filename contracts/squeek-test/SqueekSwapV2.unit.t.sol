// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "../lib/forge-std/src/Test.sol";
import {SqueekSwapV2} from "../squeek-src/SqueekSwapV2.sol";
import {MockSqueeks} from "../squeek-src/MockSqueeks.sol";

contract NotAnNFT {
    function supportsInterface(bytes4) external pure returns (bool) {
        return false;
    }
}

contract SqueekSwapV2UnitTest is Test {
    MockSqueeks first;
    MockSqueeks second;
    SqueekSwapV2 swap;
    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        first = new MockSqueeks();
        second = new MockSqueeks();
        address[] memory initial = new address[](2);
        initial[0] = address(first);
        initial[1] = address(second);
        swap = new SqueekSwapV2(admin, initial);
        first.mint(alice, 4);
        first.mint(bob, 4);
        second.mint(alice, 4);
        second.mint(bob, 4);
    }

    function _asset(address collection, uint256 tokenId) private pure returns (SqueekSwapV2.Asset memory) {
        return SqueekSwapV2.Asset(collection, tokenId);
    }

    function _assets(SqueekSwapV2.Asset memory a) private pure returns (SqueekSwapV2.Asset[] memory out) {
        out = new SqueekSwapV2.Asset[](1);
        out[0] = a;
    }

    function _assets(SqueekSwapV2.Asset memory a, SqueekSwapV2.Asset memory b)
        private
        pure
        returns (SqueekSwapV2.Asset[] memory out)
    {
        out = new SqueekSwapV2.Asset[](2);
        out[0] = a;
        out[1] = b;
    }

    function _offer(address taker, SqueekSwapV2.Asset[] memory give, SqueekSwapV2.Asset[] memory want)
        private
        view
        returns (SqueekSwapV2.Offer memory offer)
    {
        offer = SqueekSwapV2.Offer(alice, taker, uint64(block.timestamp + 7 days), 0, give, want);
    }

    function _create(SqueekSwapV2.Offer memory offer) private returns (uint256 id) {
        vm.prank(offer.maker);
        return swap.create(offer);
    }

    function _approve(MockSqueeks collection, address owner, uint256 tokenId) private {
        vm.prank(owner);
        collection.approve(address(swap), tokenId);
    }

    function test_CrossCollectionTwoForOneSwapIsAtomic() public {
        SqueekSwapV2.Offer memory offer = _offer(
            bob,
            _assets(_asset(address(first), 1), _asset(address(second), 1)),
            _assets(_asset(address(second), 5))
        );
        uint256 id = _create(offer);
        _approve(first, alice, 1);
        _approve(second, alice, 1);
        _approve(second, bob, 5);

        assertEq(uint8(swap.check(id, offer, bob)), uint8(SqueekSwapV2.Reason.Ok));
        vm.prank(bob);
        swap.fill(id, offer);

        assertEq(first.ownerOf(1), bob);
        assertEq(second.ownerOf(1), bob);
        assertEq(second.ownerOf(5), alice);
        assertEq(first.balanceOf(address(swap)), 0);
        assertEq(second.balanceOf(address(swap)), 0);
    }

    function test_SameTokenIdAcrossCollectionsIsNotADuplicate() public {
        // Alice holds token 1 in both collections; bob holds token 5 in both.
        SqueekSwapV2.Offer memory offer = _offer(
            bob,
            _assets(_asset(address(first), 1), _asset(address(second), 1)),
            _assets(_asset(address(first), 5), _asset(address(second), 5))
        );
        assertEq(_create(offer), 1);
    }

    function test_RejectsTheSameAssetTwiceOrOnBothSides() public {
        SqueekSwapV2.Asset memory one = _asset(address(first), 1);
        SqueekSwapV2.Offer memory duplicate = _offer(bob, _assets(one, one), _assets(_asset(address(first), 5)));
        vm.prank(alice);
        vm.expectRevert(SqueekSwapV2.BadItems.selector);
        swap.create(duplicate);

        SqueekSwapV2.Offer memory overlap = _offer(bob, _assets(one), _assets(one));
        vm.prank(alice);
        vm.expectRevert(SqueekSwapV2.BadItems.selector);
        swap.create(overlap);
    }

    function test_OnlyAdminCanRegisterAStandardsCompliantCollection() public {
        MockSqueeks third = new MockSqueeks();
        vm.prank(alice);
        vm.expectRevert(SqueekSwapV2.NotRegistryAdmin.selector);
        swap.setCollection(address(third), true);

        vm.prank(admin);
        swap.setCollection(address(third), true);
        assertTrue(swap.supportedCollection(address(third)));
        assertEq(swap.collectionCount(), 3);

        NotAnNFT bad = new NotAnNFT();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(SqueekSwapV2.BadCollection.selector, address(bad)));
        swap.setCollection(address(bad), true);
    }

    function test_DisablingACollectionBlocksCreateAndFillWithoutMovingAssets() public {
        SqueekSwapV2.Offer memory offer = _offer(
            bob,
            _assets(_asset(address(first), 1)),
            _assets(_asset(address(second), 5))
        );
        uint256 id = _create(offer);
        _approve(first, alice, 1);
        _approve(second, bob, 5);

        vm.prank(admin);
        swap.setCollection(address(second), false);
        assertEq(uint8(swap.check(id, offer, bob)), uint8(SqueekSwapV2.Reason.CollectionNotSupported));
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(SqueekSwapV2.CannotFill.selector, SqueekSwapV2.Reason.CollectionNotSupported)
        );
        swap.fill(id, offer);
        assertEq(first.ownerOf(1), alice);
        assertEq(second.ownerOf(5), bob);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SqueekSwapV2.UnsupportedCollection.selector, address(second)));
        swap.create(offer);
    }

    function test_RequiresPerTokenApprovalAndStaleOfferDoesNotRevive() public {
        SqueekSwapV2.Offer memory offer = _offer(
            bob,
            _assets(_asset(address(first), 1)),
            _assets(_asset(address(first), 5))
        );
        uint256 id = _create(offer);

        vm.prank(alice);
        first.setApprovalForAll(address(swap), true);
        _approve(first, bob, 5);
        assertEq(uint8(swap.check(id, offer, bob)), uint8(SqueekSwapV2.Reason.MakerNotApproved));

        _approve(first, alice, 1);
        vm.prank(alice);
        first.transferFrom(alice, carol, 1);
        vm.prank(carol);
        first.transferFrom(carol, alice, 1);
        assertEq(first.getApproved(1), address(0));
        assertEq(uint8(swap.check(id, offer, bob)), uint8(SqueekSwapV2.Reason.MakerNotApproved));
    }

    function test_CreateRequiresOneCurrentOwnerForEveryWantedAsset() public {
        SqueekSwapV2.Offer memory offer = _offer(
            address(0),
            _assets(_asset(address(first), 1)),
            _assets(_asset(address(first), 5), _asset(address(second), 6))
        );
        // Split the wanted bundle across two wallets: bob keeps first#5, carol takes second#6.
        vm.prank(bob);
        second.transferFrom(bob, carol, 6);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SqueekSwapV2.BadWantedOwner.selector, address(second), uint256(6))
        );
        swap.create(offer);
    }

    function test_TargetedOfferMustNameTheWantedOwner() public {
        SqueekSwapV2.Offer memory offer = _offer(
            carol,
            _assets(_asset(address(first), 1)),
            _assets(_asset(address(first), 5))
        );
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SqueekSwapV2.BadWantedOwner.selector, address(first), uint256(5)));
        swap.create(offer);
    }

    function test_FillIsAllowedAtExpiryAndRejectedAfter() public {
        SqueekSwapV2.Offer memory offer = _offer(
            bob,
            _assets(_asset(address(first), 1)),
            _assets(_asset(address(first), 5))
        );
        uint256 id = _create(offer);
        _approve(first, alice, 1);
        _approve(first, bob, 5);
        vm.warp(offer.expiry);
        assertEq(uint8(swap.check(id, offer, bob)), uint8(SqueekSwapV2.Reason.Ok));
        vm.warp(offer.expiry + 1);
        assertEq(uint8(swap.check(id, offer, bob)), uint8(SqueekSwapV2.Reason.Expired));
    }

    /// Documents a known V2 property: re-enabling a collection revives unexpired offers that use it.
    function test_ReEnablingACollectionRevivesUnexpiredOffers() public {
        SqueekSwapV2.Offer memory offer = _offer(
            bob,
            _assets(_asset(address(first), 1)),
            _assets(_asset(address(second), 5))
        );
        uint256 id = _create(offer);
        _approve(first, alice, 1);
        _approve(second, bob, 5);
        vm.startPrank(admin);
        swap.setCollection(address(second), false);
        swap.setCollection(address(second), true);
        vm.stopPrank();
        assertEq(uint8(swap.check(id, offer, bob)), uint8(SqueekSwapV2.Reason.Ok));
    }

    function test_SubstitutedOfferBodyIsRejected() public {
        SqueekSwapV2.Offer memory offer = _offer(
            bob,
            _assets(_asset(address(first), 1)),
            _assets(_asset(address(first), 5))
        );
        uint256 id = _create(offer);
        offer.give[0].tokenId = 2;
        assertEq(uint8(swap.check(id, offer, bob)), uint8(SqueekSwapV2.Reason.WrongOffer));
    }

    function test_TwoStepRegistryAdminTransfer() public {
        vm.prank(admin);
        swap.transferRegistryAdmin(carol);
        vm.prank(alice);
        vm.expectRevert(SqueekSwapV2.NotPendingRegistryAdmin.selector);
        swap.acceptRegistryAdmin();
        vm.prank(carol);
        swap.acceptRegistryAdmin();
        assertEq(swap.registryAdmin(), carol);
        assertEq(swap.pendingRegistryAdmin(), address(0));
    }

    function test_CancelReclaimAndRevokeRemainAvailable() public {
        SqueekSwapV2.Offer memory firstOffer = _offer(
            bob,
            _assets(_asset(address(first), 1)),
            _assets(_asset(address(first), 5))
        );
        uint256 firstId = _create(firstOffer);
        vm.prank(alice);
        swap.cancel(firstId);

        SqueekSwapV2.Offer memory secondOffer = _offer(
            bob,
            _assets(_asset(address(first), 2)),
            _assets(_asset(address(first), 6))
        );
        uint256 secondId = _create(secondOffer);
        vm.prank(alice);
        swap.revokeAll();
        assertEq(uint8(swap.check(secondId, secondOffer, bob)), uint8(SqueekSwapV2.Reason.Revoked));

        vm.warp(secondOffer.expiry + 1);
        vm.prank(carol);
        swap.reclaim(secondId);
        (,,, SqueekSwapV2.Status status) = swap.records(secondId);
        assertEq(uint8(status), uint8(SqueekSwapV2.Status.Closed));
    }

    /// The web indexer (web/lib/indexer.ts offerHash) must compute exactly this value for the same offer.
    function test_OfferHashMatchesWebIndexerVector() public pure {
        SqueekSwapV2.Asset[] memory give = new SqueekSwapV2.Asset[](1);
        give[0] = SqueekSwapV2.Asset(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa, 1);
        SqueekSwapV2.Asset[] memory want = new SqueekSwapV2.Asset[](1);
        want[0] = SqueekSwapV2.Asset(0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB, 2);
        SqueekSwapV2.Offer memory offer = SqueekSwapV2.Offer(
            0x1111111111111111111111111111111111111111, 0x2222222222222222222222222222222222222222, 605800, 3, give, want
        );
        assertEq(keccak256(abi.encode(offer)), 0x963531fadb5e482d05a91bfe0d2e1ac90ea40934b9ab985cb1942a2ba5238fca);
    }

    function test_StoredRecordHashIsTheAbiEncodedOffer() public {
        SqueekSwapV2.Offer memory offer = _offer(bob, _assets(_asset(address(first), 1)), _assets(_asset(address(first), 5)));
        uint256 id = _create(offer);
        (bytes32 hash,,,) = swap.records(id);
        assertEq(hash, keccak256(abi.encode(offer)));
    }
}
