// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockSQK is ERC20("Mock SQK", "SQK") {
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockGenesis is ERC721("Squeek", "SQUEEK") {
    mapping(uint256 => uint8) public level;

    function mint(address to, uint256 id, uint8 lvl) external {
        level[id] = lvl;
        _mint(to, id);
    }
}

contract MockOtherNFT is ERC721("Other", "OTHER") {
    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

contract MockV2Factory {
    mapping(address => mapping(address => address)) public getPair;

    function createPair(address a, address b) external returns (address p) {
        require(getPair[a][b] == address(0), "PAIR_EXISTS");
        p = address(uint160(uint256(keccak256(abi.encode(a, b, "pair")))));
        getPair[a][b] = p;
        getPair[b][a] = p;
    }
}

/// Squeekchain staking stand-in: same custody rules and the real power formula
/// W = P + S * 1e18 * (P_ref + P) / (c * P_ref), earning `rate` SQK base units per whole power unit per second.
contract MockStaking {
    enum ClaimableMode {
        Normal,
        Revert,
        BurnGas,
        HugeReturn
    }

    uint256 constant POWER_UNIT = 1e18;
    uint256 constant C = 40e18;
    uint256 constant P_REF = 1000e18;

    MockGenesis public immutable genesisNft;
    MockSQK public immutable sqk;
    mapping(uint8 => uint64) public powerOfLevel;
    mapping(address => mapping(uint256 => address)) public depositor;

    struct Acct {
        uint256 nftPower; // WAD
        uint256 principal;
        uint256 stored;
        uint256 last;
    }

    mapping(address => Acct) public accts;
    uint256 public rate = 1e15; // 1 L1 Squeek (1,000 power) earns 1 SQK per second
    bool public paused;
    bool public claimReverts;
    ClaimableMode public mode;

    constructor(MockGenesis g, MockSQK t) {
        genesisNft = g;
        sqk = t;
        uint64 p = 1000;
        for (uint8 l = 1; l <= 10; ++l) {
            powerOfLevel[l] = p;
            p = p * 22 / 10;
        }
    }

    function genesis() external view returns (address) {
        return address(genesisNft);
    }

    function token() external view returns (address) {
        return address(sqk);
    }

    function basePower(address collection, uint8 lvl) external view returns (uint64) {
        if (collection != address(genesisNft)) return 0;
        return powerOfLevel[lvl];
    }

    /// Settles `a` first so past earnings keep the old rate (Squeekchain's index never goes back).
    function setRate(address a, uint256 r) external {
        _accrue(a);
        rate = r;
    }

    function setPaused(bool p) external {
        paused = p;
    }

    function setClaimReverts(bool r) external {
        claimReverts = r;
    }

    function setMode(ClaimableMode m) external {
        mode = m;
    }

    function weight(address a) public view returns (uint256) {
        Acct memory s = accts[a];
        return s.nftPower + s.principal * 1e18 * (P_REF + s.nftPower) / (C * P_REF);
    }

    /// SQK's 2.1 billion cap bounds issuance, like the real token.
    uint256 public constant CAP = 2.1e27;
    uint256 public issued;

    function _pending(address a) internal view returns (uint256) {
        Acct memory s = accts[a];
        if (s.last == 0 || block.timestamp <= s.last) return 0;
        uint256 raw = weight(a) * rate * (block.timestamp - s.last) / POWER_UNIT;
        uint256 room = CAP - issued - s.stored;
        return raw < room ? raw : room;
    }

    function _accrue(address a) internal {
        accts[a].stored += _pending(a);
        accts[a].last = block.timestamp;
    }

    function claimable(address a) external view returns (uint256) {
        if (mode == ClaimableMode.Revert) revert("claimable broken");
        if (mode == ClaimableMode.BurnGas) {
            uint256 x;
            while (true) x++;
        }
        if (mode == ClaimableMode.HugeReturn) {
            assembly {
                return(0, 100000)
            }
        }
        return accts[a].stored + _pending(a);
    }

    /// `claimable` ignoring the failure modes, for test assertions.
    function claimableRaw(address a) external view returns (uint256) {
        return accts[a].stored + _pending(a);
    }

    function deposit(address collection, uint256[] calldata ids) external {
        require(!paused, "EmergencyPaused");
        require(collection == address(genesisNft), "InvalidDeposit");
        _accrue(msg.sender);
        for (uint256 i; i < ids.length; ++i) {
            depositor[collection][ids[i]] = msg.sender;
            accts[msg.sender].nftPower += uint256(powerOfLevel[genesisNft.level(ids[i])]) * POWER_UNIT;
            genesisNft.transferFrom(msg.sender, address(this), ids[i]);
        }
    }

    function withdraw(address collection, uint256[] calldata ids) external {
        _accrue(msg.sender);
        for (uint256 i; i < ids.length; ++i) {
            require(depositor[collection][ids[i]] == msg.sender, "Unauthorized");
            delete depositor[collection][ids[i]];
            accts[msg.sender].nftPower -= uint256(powerOfLevel[genesisNft.level(ids[i])]) * POWER_UNIT;
            genesisNft.transferFrom(address(this), msg.sender, ids[i]);
        }
    }

    function claim(address a) external returns (uint256 amount) {
        require(!claimReverts, "claim broken");
        require(msg.sender == a, "Unauthorized");
        _accrue(a);
        amount = accts[a].stored;
        accts[a].stored = 0;
        if (amount != 0) {
            issued += amount;
            sqk.mint(a, amount);
        }
    }

    function stake(uint256 amount) external {
        require(!paused, "EmergencyPaused");
        require(amount != 0, "InvalidStake");
        _accrue(msg.sender);
        accts[msg.sender].principal += amount;
        sqk.transferFrom(msg.sender, address(this), amount);
    }
}
