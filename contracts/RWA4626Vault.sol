// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./RWA4626Oracle.sol";
import "@openzeppelin/contracts/utils/Math.sol";

/**
 * @title RWA4626Vault
 * @author Your Name
 * @notice ERC4626 vault implementation for Real World Assets with oracle integration
 * @dev This contract implements the ERC4626 standard for tokenized vaults
 * It integrates with an oracle for price updates and includes fee mechanisms
 * Shares are calculated as assets/price to maintain a 1:1 ratio with the underlying asset
 */
contract RWA4626Vault is ERC4626, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    /// @notice Oracle contract for price updates
    RWA4626Oracle public oracle;
    
    /// @notice Minimum deposit amount required
    uint256 public minDeposit;
    
    /// @notice Fee in basis points (1 = 0.01%)
    uint256 public fee;
    
    /// @notice Total fees collected
    uint256 public totalFees;

    /// @notice Constant for price decimals (6 decimals)
    uint256 private constant PRICE_DECIMALS = 1e6;
    
    /**
     * @notice Emitted when the oracle address is updated
     * @param oldOracle The previous oracle address
     * @param newOracle The new oracle address
     */
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    /**
     * @notice Emitted when the minimum deposit amount is updated
     * @param oldMinDeposit The previous minimum deposit amount
     * @param newMinDeposit The new minimum deposit amount
     */
    event MinDepositUpdated(uint256 oldMinDeposit, uint256 newMinDeposit);

    /**
     * @notice Emitted when the fee is updated
     * @param oldFee The previous fee
     * @param newFee The new fee
     */
    event FeeUpdated(uint256 oldFee, uint256 newFee);

    /**
     * @notice Emitted when fees are withdrawn
     * @param admin The address that withdrew the fees
     * @param amount The amount of fees withdrawn
     */
    event FeesWithdrawn(address indexed admin, uint256 amount);
    
    /// @notice Error thrown when trying to set an invalid oracle address
    error InvalidOracle();
    /// @notice Error thrown when trying to set an invalid minimum deposit
    error InvalidMinDeposit();
    /// @notice Error thrown when trying to set an invalid fee
    error InvalidFee();
    /// @notice Error thrown when deposit amount is below minimum
    error DepositTooSmall();
    /// @notice Error thrown when oracle is not active
    error OracleNotActive();
    /// @notice Error thrown when price update is required
    error PriceUpdateRequired();
    /// @notice Error thrown when price is invalid
    error InvalidPrice();

    /**
     * @notice Constructor initializes the vault with required parameters
     * @param _asset The underlying asset token
     * @param _name The name of the vault token
     * @param _symbol The symbol of the vault token
     * @param _oracle The address of the price oracle
     * @param _minDeposit The minimum deposit amount
     * @param _fee The fee in basis points
     */
    constructor(
        IERC20 _asset,
        string memory _name,
        string memory _symbol,
        address _oracle,
        uint256 _minDeposit,
        uint256 _fee
    ) ERC4626(_asset) ERC20(_name, _symbol) Ownable(msg.sender) {
        if (_oracle == address(0)) revert InvalidOracle();
        if (_minDeposit == 0) revert InvalidMinDeposit();
        if (_fee > 1000) revert InvalidFee(); // Max 10% fee
        
        oracle = RWA4626Oracle(_oracle);
        minDeposit = _minDeposit;
        fee = _fee;
    }

    /**
     * @notice Sets the oracle address
     * @dev Only callable by the owner
     * @param _oracle The new oracle address
     */
    function setOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert InvalidOracle();
        address oldOracle = address(oracle);
        oracle = RWA4626Oracle(_oracle);
        emit OracleUpdated(oldOracle, _oracle);
    }

    /**
     * @notice Sets the minimum deposit amount
     * @dev Only callable by the owner
     * @param _minDeposit The new minimum deposit amount
     */
    function setMinDeposit(uint256 _minDeposit) external onlyOwner {
        if (_minDeposit == 0) revert InvalidMinDeposit();
        uint256 oldMinDeposit = minDeposit;
        minDeposit = _minDeposit;
        emit MinDepositUpdated(oldMinDeposit, _minDeposit);
    }

    /**
     * @notice Sets the fee
     * @dev Only callable by the owner
     * @param _fee The new fee in basis points
     */
    function setFee(uint256 _fee) external onlyOwner {
        if (_fee > 1000) revert InvalidFee(); // Max 10% fee
        uint256 oldFee = fee;
        fee = _fee;
        emit FeeUpdated(oldFee, _fee);
    }

    /**
     * @notice Withdraws collected fees
     * @dev Only callable by the owner
     */
    function withdrawFees() external onlyOwner {
        uint256 amount = totalFees;
        totalFees = 0;
        IERC20(asset()).safeTransfer(owner(), amount);
        emit FeesWithdrawn(owner(), amount);
    }

    /**
     * @notice Pauses the vault
     * @dev Only callable by the owner
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses the vault
     * @dev Only callable by the owner
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Gets the current price from the oracle
     * @return The current price in USD (6 decimals)
     */
    function getCurrentPrice() public view returns (uint256) {
        if (!oracle.isAssetActive(address(this))) revert OracleNotActive();
        return oracle.getPrice(address(this));
    }

    /**
     * @notice Checks if a price update is required
     * @return Whether a price update is required
     */
    function isPriceUpdateRequired() public view returns (bool) {
        if (!oracle.isAssetActive(address(this))) revert OracleNotActive();
        uint256 lastUpdate = oracle.getLastUpdateTime(address(this));
        uint256 interval = oracle.getUpdateInterval(address(this));
        return block.timestamp >= lastUpdate + interval;
    }

    /**
     * @notice Internal function to convert assets to shares
     * @dev Overrides ERC4626 _convertToShares to implement assets/price formula
     * @param assets The amount of assets to convert
     * @param rounding The rounding mode to use
     * @return The amount of shares
     */
    function _convertToShares(
        uint256 assets,
        Math.Rounding rounding
    ) internal view override returns (uint256) {
        if (isPriceUpdateRequired()) revert PriceUpdateRequired();
        
        uint256 price = getCurrentPrice();
        if (price == 0) revert InvalidPrice();
        
        // Calculate shares as assets/price
        // Multiply by PRICE_DECIMALS to maintain precision
        return assets * PRICE_DECIMALS / price;
    }

    /**
     * @notice Internal function to convert shares to assets
     * @dev Overrides ERC4626 _convertToAssets to implement shares * price formula
     * @param shares The amount of shares to convert
     * @param rounding The rounding mode to use
     * @return The amount of assets
     */
    function _convertToAssets(
        uint256 shares,
        Math.Rounding rounding
    ) internal view override returns (uint256) {
        if (isPriceUpdateRequired()) revert PriceUpdateRequired();
        
        uint256 price = getCurrentPrice();
        if (price == 0) revert InvalidPrice();
        
        // Calculate assets as shares * price
        // Divide by PRICE_DECIMALS to maintain precision
        return shares * price / PRICE_DECIMALS;
    }

    /**
     * @notice Deposits assets into the vault
     * @dev Overrides ERC4626 deposit function to add fee collection
     * @param assets The amount of assets to deposit
     * @param receiver The address to receive the shares
     * @return The amount of shares minted
     */
    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        if (assets < minDeposit) revert DepositTooSmall();
        if (isPriceUpdateRequired()) revert PriceUpdateRequired();
        
        uint256 shares = super.deposit(assets, receiver);
        
        // Calculate and collect fee
        uint256 feeAmount = (assets * fee) / 10000;
        if (feeAmount > 0) {
            totalFees += feeAmount;
        }
        
        return shares;
    }

    /**
     * @notice Mints shares by depositing assets
     * @dev Overrides ERC4626 mint function to add price update check
     * @param shares The amount of shares to mint
     * @param receiver The address to receive the shares
     * @return The amount of assets deposited
     */
    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        if (isPriceUpdateRequired()) revert PriceUpdateRequired();
        return super.mint(shares, receiver);
    }

    /**
     * @notice Withdraws assets from the vault
     * @dev Overrides ERC4626 withdraw function to add price update check
     * @param assets The amount of assets to withdraw
     * @param receiver The address to receive the assets
     * @param owner The address that owns the shares
     * @return The amount of shares burned
     */
    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        if (isPriceUpdateRequired()) revert PriceUpdateRequired();
        return super.withdraw(assets, receiver, owner);
    }

    /**
     * @notice Redeems shares for assets
     * @dev Overrides ERC4626 redeem function to add price update check
     * @param shares The amount of shares to redeem
     * @param receiver The address to receive the assets
     * @param owner The address that owns the shares
     * @return The amount of assets withdrawn
     */
    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        if (isPriceUpdateRequired()) revert PriceUpdateRequired();
        return super.redeem(shares, receiver, owner);
    }

    /**
     * @notice Converts assets to shares
     * @dev Overrides ERC4626 convertToShares function to add price update check
     * @param assets The amount of assets
     * @return The amount of shares
     */
    function convertToShares(uint256 assets)
        public
        view
        override
        returns (uint256)
    {
        if (isPriceUpdateRequired()) revert PriceUpdateRequired();
        return super.convertToShares(assets);
    }

    /**
     * @notice Converts shares to assets
     * @dev Overrides ERC4626 convertToAssets function to add price update check
     * @param shares The amount of shares
     * @return The amount of assets
     */
    function convertToAssets(uint256 shares)
        public
        view
        override
        returns (uint256)
    {
        if (isPriceUpdateRequired()) revert PriceUpdateRequired();
        return super.convertToAssets(shares);
    }
} 