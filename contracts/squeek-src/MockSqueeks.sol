// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721Enumerable} from "../lib/openzeppelin-contracts/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721} from "../lib/openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";

/// @notice Local-only enumerable Squeek stand-in used by tests and the Anvil demo.
contract MockSqueeks is ERC721Enumerable {
    uint256 public nextId = 1;
    mapping(uint256 tokenId => uint8) public level;

    constructor() ERC721("Test Squeeks", "tSQUEEK") {}

    function mint(address to, uint256 count) external returns (uint256 first) {
        require(count > 0 && count <= 8, "bad count");
        first = nextId;
        for (uint256 i; i < count; ++i) {
            uint256 tokenId = nextId++;
            level[tokenId] = uint8(tokenId % 10 + 1);
            _mint(to, tokenId);
        }
    }
}
