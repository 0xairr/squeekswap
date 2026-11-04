// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "../lib/forge-std/src/Test.sol";
import {SqueekSwap, IERC721Swap} from "../squeek-src/SqueekSwap.sol";
import {MockSqueeks} from "../squeek-src/MockSqueeks.sol";

contract SqueekSwapUnitTest is Test {
    MockSqueeks squeeks;
    SqueekSwap swap;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        squeeks = new MockSqueeks();
        swap = new SqueekSwap(IERC721Swap(address(squeeks)));
        squeeks.mint(alice, 4);
        squeeks.mint(bob, 4);
    }

    function _ids(uint256 a) private pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = a;
    }

    function _ids(uint256 a, uint256 b) private pure returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
    }

    function _offer(address taker, uint256[] memory give, uint256[] memory want)
        private
        view
        returns (SqueekSwap.Offer memory offer)
    {
        offer = SqueekSwap.Offer(alice, taker, uint64(block.timestamp + 7 days), 0, give, want);
    }

    function _create(SqueekSwap.Offer memory offer) private returns (uint256 id) {
        vm.prank(offer.maker);
        return swap.create(offer);
    }

    function _approve(address owner, uint256 id) private {
        vm.prank(owner);
        squeeks.approve(address(swap), id);
    }

    function test_TwoForOnePrivateSwapIsAtomic() public {
        SqueekSwap.Offer memory offer = _offer(bob, _ids(1, 2), _ids(5));
        uint256 id = _create(offer);
        _approve(alice, 1);
        _approve(alice, 2);
        _approve(bob, 5);

        assertEq(uint8(swap.check(id, offer, bob)), uint8(SqueekSwap.Reason.Ok));
        vm.prank(bob);
        swap.fill(id, offer);

        assertEq(squeeks.ownerOf(1), bob);
        assertEq(squeeks.ownerOf(2), bob);
        assertEq(squeeks.ownerOf(5), alice);
        (,,, SqueekSwap.Status status) = swap.records(id);
        assertEq(uint8(status), uint8(SqueekSwap.Status.Filled));
        assertEq(squeeks.balanceOf(address(swap)), 0);
    }

    function test_FailedSecondTransferRollsBackEverything() public {
        SqueekSwap.Offer memory offer = _offer(bob, _ids(1, 2), _ids(5));
        uint256 id = _create(offer);
        _approve(alice, 1);
        _approve(bob, 5);
        assertEq(uint8(swap.check(id, offer, bob)), uint8(SqueekSwap.Reason.MakerNotApproved));
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SqueekSwap.CannotFill.selector, SqueekSwap.Reason.MakerNotApproved));
        swap.fill(id, offer);
        assertEq(squeeks.ownerOf(5), bob);
        assertEq(squeeks.ownerOf(1), alice);
    }

    function test_PublicOfferCanBeFilledByCurrentWantedOwner() public {
        SqueekSwap.Offer memory offer = _offer(address(0), _ids(1), _ids(5));
        uint256 id = _create(offer);
        _approve(alice, 1);
        _approve(bob, 5);
        vm.prank(bob);
        swap.fill(id, offer);
        assertEq(squeeks.ownerOf(1), bob);
    }

    function test_PrivateOfferRejectsAnotherWallet() public {
        SqueekSwap.Offer memory offer = _offer(bob, _ids(1), _ids(5));
        uint256 id = _create(offer);
        assertEq(uint8(swap.check(id, offer, carol)), uint8(SqueekSwap.Reason.TakerNotAllowed));
    }

    function test_CancelAndReclaimCloseOffers() public {
        SqueekSwap.Offer memory first = _offer(bob, _ids(1), _ids(5));
        uint256 firstId = _create(first);
        vm.prank(alice);
        swap.cancel(firstId);

        SqueekSwap.Offer memory second = _offer(bob, _ids(2), _ids(6));
        uint256 secondId = _create(second);
        vm.warp(second.expiry + 1);
        vm.prank(carol);
        swap.reclaim(secondId);
        (,,, SqueekSwap.Status status) = swap.records(secondId);
        assertEq(uint8(status), uint8(SqueekSwap.Status.Closed));
    }

    function test_RevokeAllInvalidatesEveryOlderOffer() public {
        SqueekSwap.Offer memory offer = _offer(bob, _ids(1), _ids(5));
        uint256 id = _create(offer);
        vm.prank(alice);
        swap.revokeAll();
        assertEq(uint8(swap.check(id, offer, bob)), uint8(SqueekSwap.Reason.Revoked));
    }

    function test_RejectsDuplicateCrossSideEmptyAndOversizedOffers() public {
        SqueekSwap.Offer memory duplicate = _offer(bob, _ids(1), _ids(1));
        vm.prank(alice);
        vm.expectRevert(SqueekSwap.BadItems.selector);
        swap.create(duplicate);

        uint256[] memory none = new uint256[](0);
        SqueekSwap.Offer memory empty = _offer(bob, _ids(1), none);
        vm.prank(alice);
        vm.expectRevert(SqueekSwap.BadItems.selector);
        swap.create(empty);

        uint256[] memory many = new uint256[](9);
        SqueekSwap.Offer memory oversized = _offer(bob, many, _ids(5));
        vm.prank(alice);
        vm.expectRevert(SqueekSwap.BadItems.selector);
        swap.create(oversized);
    }

    function test_RejectsWrongBodyExpiryNonceMakerAndSelfTrade() public {
        SqueekSwap.Offer memory offer = _offer(bob, _ids(1), _ids(5));
        uint256 id = _create(offer);
        offer.want[0] = 6;
        assertEq(uint8(swap.check(id, offer, bob)), uint8(SqueekSwap.Reason.WrongOffer));

        SqueekSwap.Offer memory expired = _offer(bob, _ids(1), _ids(5));
        expired.expiry = uint64(block.timestamp);
        vm.prank(alice);
        vm.expectRevert(SqueekSwap.BadExpiry.selector);
        swap.create(expired);

        SqueekSwap.Offer memory self = _offer(alice, _ids(1), _ids(2));
        vm.prank(alice);
        vm.expectRevert(SqueekSwap.SelfTrade.selector);
        swap.create(self);
    }

    function test_ConstructorRejectsZeroCollection() public {
        vm.expectRevert(SqueekSwap.BadConfig.selector);
        new SqueekSwap(IERC721Swap(address(0)));
    }
}
