// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface ISqueekGenesis {
    function level(uint256 tokenId) external view returns (uint8);
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
}

interface ISqueekStaking {
    function genesis() external view returns (address);
    function token() external view returns (address);
    function basePower(address collection, uint8 level) external view returns (uint64);
    function claimable(address account) external view returns (uint256);
    function deposit(address collection, uint256[] calldata tokenIds) external;
    function withdraw(address collection, uint256[] calldata tokenIds) external;
    function claim(address account) external returns (uint256);
    function stake(uint256 amount) external;
}


/// @title SqueekSwap Vault
/// @notice Lock Squeek Genesis NFTs for coins equal to their power. Locked Squeeks are staked in
///         Squeekchain; 75% of the SQK they earn is paid to coin holders for every second they hold,
///         25% is re-staked forever as the vault's house stake. Burn a Squeek's coins to take it out.
/// @dev The owner can only schedule the unlock fee (max 5%, 3-day delay). Nobody can move locked
///      Squeeks, coins or SQK that belong to someone else. The official Uniswap V2 pair, the Uniswap
///      V4 PoolManager and this contract never earn.
contract SqueekVault is ERC20, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    /// Share of earned SQK re-staked as the house stake.
    uint256 public constant HOUSE_BPS = 2_500;
    uint256 public constant MAX_UNLOCK_FEE_BPS = 500;
    uint256 public constant FEE_DELAY = 3 days;
    /// Squeekchain's deposit and withdraw limit.
    uint256 public constant MAX_BATCH = 100;
    /// Gas given to the `claimable` read in every checkpoint.
    uint256 public constant CLAIMABLE_GAS = 100_000;
    /// Coins minted per unit of Squeek power.
    uint256 public constant COINS_PER_POWER = 1e18;

    uint256 private constant BPS = 10_000;
    uint256 private constant ACC = 1e18;
    /// Uniswap V2 pair creation-code hash (same on mainnet and Sepolia).
    bytes32 private constant V2_PAIR_INIT_CODE_HASH = 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f;

    struct LockInfo {
        address lockedBy;
        uint64 power;
    }

    struct Account {
        uint256 sqkPaid;
        uint256 coinPaid;
        uint256 sqkOwed;
        uint256 coinOwed;
    }

    ISqueekGenesis public immutable genesis;
    ISqueekStaking public immutable staking;
    IERC20 public immutable sqk;
    /// Official Uniswap V2 coin/WETH pair: its CREATE2 address, fixed before the pair exists. Whoever
    /// creates the pair (usually the first add-liquidity), it lands at exactly this address.
    address public immutable pair;
    /// Uniswap V4 PoolManager (holds every V4 pool's tokens).
    address public immutable poolManager;

    mapping(uint256 tokenId => LockInfo) private _locks;
    EnumerableSet.UintSet private _locked;
    mapping(address account => Account) private _accounts;

    /// SQK received from Squeekchain claims.
    uint256 public harvested;
    /// `harvested + claimable` at the last checkpoint: all SQK already split.
    uint256 public accounted;
    /// SQK split to holders and not yet paid out.
    uint256 public sqkReserved;
    /// SQK assigned to the house and not yet staked.
    uint256 public houseOwed;
    /// SQK staked as the house stake so far. It never comes out.
    uint256 public houseStaked;
    /// Fee coins owed to holders and not yet claimed.
    uint256 public coinReserved;

    uint256 public sqkPerCoin;
    uint256 public coinPerCoin;
    uint256 private _sqkCarry;
    uint256 private _coinCarry;

    uint16 private _feeBps;
    uint16 private _nextFeeBps;
    uint64 private _nextFeeAt;
    /// A checkpoint read of Squeekchain failed since the last good one.
    bool private _missedRead;

    event Locked(address indexed account, uint256[] tokenIds, uint256 coins);
    event Unlocked(address indexed account, uint256[] tokenIds, uint256 coins, uint256 fee);
    event Split(uint256 toHolders, uint256 toHouse);
    event Harvested(uint256 amount);
    event HouseStaked(uint256 amount);
    event RewardsClaimed(address indexed account, uint256 sqkAmount, uint256 coinAmount);
    event UnlockFeeScheduled(uint256 bps, uint256 effectiveAt);

    error BadBatch();
    error NotGenesis();
    error NotLocked(uint256 tokenId);
    error UnknownLevel(uint256 tokenId);
    error FeeTooHigh();
    error NoTransferToVault();
    error InsufficientGas();
    error WrongStaking();

    constructor(
        string memory name_,
        string memory symbol_,
        ISqueekStaking staking_,
        address v2Factory,
        address weth,
        address poolManager_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        address genesis_ = staking_.genesis();
        address sqk_ = staking_.token();
        if (genesis_ == address(0) || sqk_ == address(0)) revert WrongStaking();
        staking = staking_;
        genesis = ISqueekGenesis(genesis_);
        sqk = IERC20(sqk_);
        poolManager = poolManager_;
        // Computed, not created: creating the pair here would add ~11 KB of new code to the deploy, which
        // Sepolia's state pricing makes a ~37M-gas transaction.
        (address token0, address token1) = address(this) < weth ? (address(this), weth) : (weth, address(this));
        pair = address(uint160(uint256(keccak256(abi.encodePacked(
            hex"ff", v2Factory, keccak256(abi.encodePacked(token0, token1)), V2_PAIR_INIT_CODE_HASH
        )))));
        ISqueekGenesis(genesis_).setApprovalForAll(address(staking_), true);
    }

    // ---------------------------------------------------------------------
    // Lock and unlock
    // ---------------------------------------------------------------------

    /// @notice Lock your Squeeks (approve this vault first) and receive coins equal to their power.
    function lock(uint256[] calldata tokenIds) external nonReentrant returns (uint256 coins) {
        uint256 count = tokenIds.length;
        if (count == 0 || count > MAX_BATCH) revert BadBatch();
        uint256 power;
        for (uint256 i; i < count; ++i) {
            uint256 tokenId = tokenIds[i];
            // `from` must be the owner, so nobody can lock another wallet's Squeek.
            genesis.transferFrom(msg.sender, address(this), tokenId);
            power += _record(tokenId, msg.sender);
        }
        staking.deposit(address(genesis), tokenIds);
        coins = power * COINS_PER_POWER;
        _mint(msg.sender, coins);
        emit Locked(msg.sender, tokenIds, coins);
    }

    /// @notice `safeTransferFrom` a Squeek to this vault to lock it in one transaction.
    ///         Coins go to the previous owner.
    function onERC721Received(address, address from, uint256 tokenId, bytes calldata)
        external
        nonReentrant
        returns (bytes4)
    {
        if (msg.sender != address(genesis)) revert NotGenesis();
        uint256 power = _record(tokenId, from);
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        staking.deposit(address(genesis), tokenIds);
        uint256 coins = power * COINS_PER_POWER;
        _mint(from, coins);
        emit Locked(from, tokenIds, coins);
        return this.onERC721Received.selector;
    }

    /// @notice Burn each Squeek's coins (plus the unlock fee for Squeeks you didn't lock) and take them out.
    function unlock(uint256[] calldata tokenIds) external nonReentrant returns (uint256 coins, uint256 fee) {
        uint256 count = tokenIds.length;
        if (count == 0 || count > MAX_BATCH) revert BadBatch();
        uint256 feeBps = unlockFeeBps();
        for (uint256 i; i < count; ++i) {
            uint256 tokenId = tokenIds[i];
            LockInfo memory info = _locks[tokenId];
            if (info.power == 0) revert NotLocked(tokenId);
            uint256 tokenCoins = uint256(info.power) * COINS_PER_POWER;
            coins += tokenCoins;
            if (feeBps != 0 && info.lockedBy != msg.sender) fee += tokenCoins * feeBps / BPS;
            delete _locks[tokenId];
            _locked.remove(tokenId);
        }
        _burn(msg.sender, coins);
        if (fee != 0) fee = _chargeFee(msg.sender, fee);
        staking.withdraw(address(genesis), tokenIds);
        for (uint256 i; i < count; ++i) {
            genesis.safeTransferFrom(address(this), msg.sender, tokenIds[i]);
        }
        emit Unlocked(msg.sender, tokenIds, coins, fee);
    }

    // ---------------------------------------------------------------------
    // Rewards
    // ---------------------------------------------------------------------

    /// @notice Collect the vault's SQK from Squeekchain and stake the house share. Anyone can call.
    function harvest() external nonReentrant {
        _harvest();
    }

    /// @notice Harvest, then send your SQK and fee coins.
    function claim() external nonReentrant returns (uint256 sqkAmount, uint256 coinAmount) {
        _harvest();
        _settle(msg.sender);
        Account storage account = _accounts[msg.sender];
        sqkAmount = account.sqkOwed;
        uint256 held = sqk.balanceOf(address(this));
        // Holders are paid before the house; if a Squeekchain claim failed, pay what is here.
        if (sqkAmount > held) sqkAmount = held;
        coinAmount = account.coinOwed;
        account.sqkOwed -= sqkAmount;
        account.coinOwed = 0;
        sqkReserved -= sqkAmount;
        coinReserved -= coinAmount;
        if (sqkAmount != 0) sqk.safeTransfer(msg.sender, sqkAmount);
        if (coinAmount != 0) _transfer(address(this), msg.sender, coinAmount);
        emit RewardsClaimed(msg.sender, sqkAmount, coinAmount);
    }

    // ---------------------------------------------------------------------
    // Unlock fee (the owner's only power)
    // ---------------------------------------------------------------------

    /// @notice Schedule a new unlock fee; it applies FEE_DELAY after this call.
    function scheduleUnlockFee(uint16 bps) external onlyOwner {
        if (bps > MAX_UNLOCK_FEE_BPS) revert FeeTooHigh();
        _feeBps = uint16(unlockFeeBps());
        _nextFeeBps = bps;
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 effectiveAt = uint64(block.timestamp + FEE_DELAY);
        _nextFeeAt = effectiveAt;
        emit UnlockFeeScheduled(bps, effectiveAt);
    }

    function unlockFeeBps() public view returns (uint256) {
        if (_nextFeeAt != 0 && block.timestamp >= _nextFeeAt) return _nextFeeBps;
        return _feeBps;
    }

    /// @return bps The scheduled fee. @return effectiveAt When it applies (0 if nothing scheduled).
    function scheduledUnlockFee() external view returns (uint256 bps, uint256 effectiveAt) {
        return (_nextFeeBps, _nextFeeAt);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function isExcluded(address account) public view returns (bool) {
        return account == pair || account == poolManager || account == address(this);
    }

    /// Coins that earn: all coins except those held by the pair, the PoolManager and this vault.
    function earningSupply() public view returns (uint256) {
        return totalSupply() - balanceOf(pair) - balanceOf(poolManager) - balanceOf(address(this));
    }

    function lockInfo(uint256 tokenId) external view returns (address lockedBy, uint256 power) {
        LockInfo memory info = _locks[tokenId];
        return (info.lockedBy, info.power);
    }

    function lockedCount() external view returns (uint256) {
        return _locked.length();
    }

    function lockedIds(uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        uint256 total = _locked.length();
        if (offset >= total) return new uint256[](0);
        uint256 end = limit > total - offset ? total : offset + limit;
        ids = new uint256[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            ids[i - offset] = _locked.at(i);
        }
    }

    /// @notice SQK and fee coins `account` could claim now, including SQK earned since the last checkpoint.
    function pendingRewards(address account) external view returns (uint256 sqkAmount, uint256 coinAmount) {
        if (isExcluded(account)) return (0, 0);
        uint256 acc = sqkPerCoin;
        (bool ok, uint256 claimableNow) = _readClaimable();
        uint256 earned = harvested + claimableNow;
        if (ok && !_missedRead && earned > accounted) {
            uint256 supply = earningSupply();
            if (supply != 0) {
                uint256 delta = earned - accounted;
                uint256 toHolders = delta - delta * HOUSE_BPS / BPS;
                acc += (toHolders * ACC + _sqkCarry) / supply;
            }
        }
        Account storage state = _accounts[account];
        uint256 balance = balanceOf(account);
        sqkAmount = state.sqkOwed + Math.mulDiv(balance, acc - state.sqkPaid, ACC);
        coinAmount = state.coinOwed + Math.mulDiv(balance, coinPerCoin - state.coinPaid, ACC);
    }

    // ---------------------------------------------------------------------
    // ERC-20
    // ---------------------------------------------------------------------

    function transfer(address to, uint256 value) public override returns (bool) {
        if (to == address(this)) revert NoTransferToVault();
        return super.transfer(to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (to == address(this)) revert NoTransferToVault();
        return super.transferFrom(from, to, value);
    }

    /// Every mint, burn and transfer first splits SQK earned so far, then settles both wallets.
    function _update(address from, address to, uint256 value) internal override {
        _checkpoint();
        _settle(from);
        _settle(to);
        super._update(from, to, value);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _record(uint256 tokenId, address lockedBy) private returns (uint64 power) {
        power = staking.basePower(address(genesis), genesis.level(tokenId));
        if (power == 0) revert UnknownLevel(tokenId);
        _locks[tokenId] = LockInfo(lockedBy, power);
        _locked.add(tokenId);
    }

    /// Fee coins move to this vault and are owed to every earning coin. With no earners, no fee.
    /// Known limit: coins borrowed for one transaction share the fee, so a fee above 0 can be mostly
    /// avoided with a flash loan. The fee starts at 0; a real fee would need a vault that streams it.
    function _chargeFee(address payer, uint256 fee) private returns (uint256) {
        _transfer(payer, address(this), fee);
        uint256 supply = earningSupply();
        if (supply == 0) {
            _transfer(address(this), payer, fee);
            return 0;
        }
        coinReserved += fee;
        uint256 pending = fee * ACC + _coinCarry;
        coinPerCoin += pending / supply;
        _coinCarry = pending % supply;
        return fee;
    }

    function _harvest() private {
        _checkpoint();
        uint256 before = sqk.balanceOf(address(this));
        try staking.claim(address(this)) {
            uint256 received = sqk.balanceOf(address(this)) - before;
            if (received != 0) {
                harvested += received;
                emit Harvested(received);
            }
        } catch {}
        _stakeHouse();
    }

    function _stakeHouse() private {
        uint256 amount = houseOwed;
        uint256 held = sqk.balanceOf(address(this));
        uint256 free = held > sqkReserved ? held - sqkReserved : 0;
        if (amount > free) amount = free;
        if (amount == 0) return;
        sqk.forceApprove(address(staking), amount);
        try staking.stake(amount) {
            houseOwed -= amount;
            houseStaked += amount;
            emit HouseStaked(amount);
        } catch {
            // Squeekchain intake paused: try again at the next harvest.
            sqk.forceApprove(address(staking), 0);
        }
    }

    /// Split SQK earned since the last checkpoint: 75% to earning coins, 25% to the house.
    /// SQK earned across a failed read can't be timed to holders, so all of it goes to the house.
    function _checkpoint() private {
        uint256 supply = earningSupply();
        (bool ok, uint256 claimableNow) = _readClaimable();
        if (!ok) {
            if (!_missedRead) _missedRead = true;
            return;
        }
        bool missed = _missedRead;
        if (missed) _missedRead = false;
        uint256 earned = harvested + claimableNow;
        if (earned <= accounted) return;
        uint256 delta = earned - accounted;
        accounted = earned;
        if (supply == 0 || missed) {
            houseOwed += delta;
            emit Split(0, delta);
            return;
        }
        uint256 toHolders = delta - delta * HOUSE_BPS / BPS;
        houseOwed += delta - toHolders;
        sqkReserved += toHolders;
        uint256 pending = toHolders * ACC + _sqkCarry;
        sqkPerCoin += pending / supply;
        _sqkCarry = pending % supply;
        emit Split(toHolders, delta - toHolders);
    }

    function _settle(address account) private {
        if (account == address(0) || isExcluded(account)) return;
        Account storage state = _accounts[account];
        uint256 balance = balanceOf(account);
        uint256 sqkAcc = sqkPerCoin;
        if (state.sqkPaid != sqkAcc) {
            if (balance != 0) state.sqkOwed += Math.mulDiv(balance, sqkAcc - state.sqkPaid, ACC);
            state.sqkPaid = sqkAcc;
        }
        uint256 coinAcc = coinPerCoin;
        if (state.coinPaid != coinAcc) {
            if (balance != 0) state.coinOwed += Math.mulDiv(balance, coinAcc - state.coinPaid, ACC);
            state.coinPaid = coinAcc;
        }
    }

    /// `staking.claimable(this)` with capped gas, reading only one word of return data. The caller must
    /// leave enough gas for the full cap, so a failed read always comes from Squeekchain, never the caller.
    function _readClaimable() private view returns (bool ok, uint256 value) {
        if (gasleft() < CLAIMABLE_GAS + CLAIMABLE_GAS / 63 + 5_000) revert InsufficientGas();
        bytes memory data = abi.encodeCall(ISqueekStaking.claimable, (address(this)));
        address target = address(staking);
        uint256 gasCap = CLAIMABLE_GAS;
        uint256 size;
        assembly ("memory-safe") {
            ok := staticcall(gasCap, target, add(data, 0x20), mload(data), 0x00, 0x20)
            size := returndatasize()
            value := mload(0x00)
        }
        if (!ok || size < 32) return (false, 0);
    }
}
