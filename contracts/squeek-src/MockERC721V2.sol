// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal standards-shaped ERC-721 used only by local V2 integration tests.
contract MockERC721V2 {
    string public name;
    string public symbol;
    uint256 public nextTokenId = 1;
    mapping(uint256 => address) private owners;
    mapping(address => uint256) private balances;
    mapping(uint256 => address) private approvals;
    mapping(address => mapping(address => bool)) private operatorApprovals;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x80ac58cd || interfaceId == 0x5b5e139f;
    }

    function mint(address to, uint256 count) external returns (uint256 first) {
        require(to != address(0) && count > 0 && count <= 16, "bad mint");
        first = nextTokenId;
        for (uint256 i; i < count; ++i) {
            uint256 tokenId = nextTokenId++;
            owners[tokenId] = to;
            ++balances[to];
            emit Transfer(address(0), to, tokenId);
        }
    }

    function ownerOf(uint256 tokenId) public view returns (address owner) {
        owner = owners[tokenId];
        require(owner != address(0), "not minted");
    }

    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "zero owner");
        return balances[owner];
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        ownerOf(tokenId);
        return approvals[tokenId];
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return operatorApprovals[owner][operator];
    }

    function approve(address approved, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        require(msg.sender == owner || operatorApprovals[owner][msg.sender], "not authorized");
        approvals[tokenId] = approved;
        emit Approval(owner, approved, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        require(owner == from && to != address(0), "bad transfer");
        require(msg.sender == owner || approvals[tokenId] == msg.sender || operatorApprovals[owner][msg.sender], "not authorized");
        approvals[tokenId] = address(0);
        owners[tokenId] = to;
        --balances[from];
        ++balances[to];
        emit Transfer(from, to, tokenId);
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        return string.concat("https://example.invalid/nft/", _toString(tokenId), ".json");
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 digits;
        uint256 temp = value;
        while (temp != 0) {
            ++digits;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            --digits;
            buffer[digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(buffer);
    }
}
