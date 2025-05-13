// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title RWA4626Oracle
 * @author Your Name
 * @notice Oracle contract for providing price feeds to RWA4626 vaults
 * @dev This contract manages price feeds for Real World Assets (RWA) vaults
 * It allows adding assets, updating prices, and enforcing minimum update intervals
 */
contract RWA4626Oracle is Ownable, Pausable {
    /**
     * @notice Struct to store price data for each asset
     * @param price Current price in USD (6 decimals)
     * @param lastUpdateTime Timestamp of last price update
     * @param updateInterval Minimum time required between updates
     * @param isActive Whether this price feed is currently active
     */
    struct PriceData {
        uint256 price;           // Current price in USD (6 decimals)
        uint256 lastUpdateTime;  // Timestamp of last update
        uint256 updateInterval;  // Minimum time between updates
        bool isActive;           // Whether this price feed is active
    }

    /// @notice Mapping from asset address to its price data
    mapping(address => PriceData) private _priceData;
    
    /**
     * @notice Emitted when a price is updated for an asset
     * @param asset The address of the asset
     * @param oldPrice The previous price
     * @param newPrice The new price
     */
    event PriceUpdated(address indexed asset, uint256 oldPrice, uint256 newPrice);

    /**
     * @notice Emitted when a new asset is added to the oracle
     * @param asset The address of the asset
     * @param initialPrice The initial price set
     * @param updateInterval The minimum time between updates
     */
    event AssetAdded(address indexed asset, uint256 initialPrice, uint256 updateInterval);

    /**
     * @notice Emitted when an asset is removed from the oracle
     * @param asset The address of the removed asset
     */
    event AssetRemoved(address indexed asset);

    /**
     * @notice Emitted when the update interval is changed for an asset
     * @param asset The address of the asset
     * @param oldInterval The previous update interval
     * @param newInterval The new update interval
     */
    event UpdateIntervalChanged(address indexed asset, uint256 oldInterval, uint256 newInterval);

    /// @notice Error thrown when trying to access an inactive asset
    error AssetNotActive();
    /// @notice Error thrown when trying to update price too frequently
    error UpdateTooFrequent();
    /// @notice Error thrown when trying to set an invalid price (zero)
    error InvalidPrice();
    /// @notice Error thrown when trying to set an invalid update interval (zero)
    error InvalidUpdateInterval();
    /// @notice Error thrown when trying to add an asset that already exists
    error AssetAlreadyExists();

    /**
     * @notice Constructor initializes the contract with the deployer as owner
     */
    constructor() Ownable(msg.sender) {}

    /**
     * @notice Adds a new asset to the oracle
     * @dev Only callable by the owner
     * @param asset The address of the asset to add
     * @param initialPrice The initial price in USD (6 decimals)
     * @param updateInterval The minimum time between updates
     */
    function addAsset(
        address asset,
        uint256 initialPrice,
        uint256 updateInterval
    ) external onlyOwner {
        if (_priceData[asset].isActive) revert AssetAlreadyExists();
        if (initialPrice == 0) revert InvalidPrice();
        if (updateInterval == 0) revert InvalidUpdateInterval();

        _priceData[asset] = PriceData({
            price: initialPrice,
            lastUpdateTime: block.timestamp,
            updateInterval: updateInterval,
            isActive: true
        });

        emit AssetAdded(asset, initialPrice, updateInterval);
    }

    /**
     * @notice Removes an asset from the oracle
     * @dev Only callable by the owner
     * @param asset The address of the asset to remove
     */
    function removeAsset(address asset) external onlyOwner {
        if (!_priceData[asset].isActive) revert AssetNotActive();
        
        delete _priceData[asset];
        emit AssetRemoved(asset);
    }

    /**
     * @notice Updates the price for an asset
     * @dev Only callable by the owner, enforces minimum update interval
     * @param asset The address of the asset
     * @param newPrice The new price in USD (6 decimals)
     */
    function updatePrice(address asset, uint256 newPrice) external onlyOwner {
        PriceData storage data = _priceData[asset];
        if (!data.isActive) revert AssetNotActive();
        if (newPrice == 0) revert InvalidPrice();
        
        // Check if enough time has passed since last update
        if (block.timestamp < data.lastUpdateTime + data.updateInterval) {
            revert UpdateTooFrequent();
        }

        uint256 oldPrice = data.price;
        data.price = newPrice;
        data.lastUpdateTime = block.timestamp;

        emit PriceUpdated(asset, oldPrice, newPrice);
    }

    /**
     * @notice Changes the update interval for an asset
     * @dev Only callable by the owner
     * @param asset The address of the asset
     * @param newInterval The new update interval
     */
    function setUpdateInterval(address asset, uint256 newInterval) external onlyOwner {
        if (!_priceData[asset].isActive) revert AssetNotActive();
        if (newInterval == 0) revert InvalidUpdateInterval();

        uint256 oldInterval = _priceData[asset].updateInterval;
        _priceData[asset].updateInterval = newInterval;

        emit UpdateIntervalChanged(asset, oldInterval, newInterval);
    }

    /**
     * @notice Gets the current price for an asset
     * @param asset The address of the asset
     * @return The current price in USD (6 decimals)
     */
    function getPrice(address asset) external view returns (uint256) {
        if (!_priceData[asset].isActive) revert AssetNotActive();
        return _priceData[asset].price;
    }

    /**
     * @notice Gets the last update time for an asset
     * @param asset The address of the asset
     * @return The timestamp of the last update
     */
    function getLastUpdateTime(address asset) external view returns (uint256) {
        if (!_priceData[asset].isActive) revert AssetNotActive();
        return _priceData[asset].lastUpdateTime;
    }

    /**
     * @notice Gets the update interval for an asset
     * @param asset The address of the asset
     * @return The minimum time between updates
     */
    function getUpdateInterval(address asset) external view returns (uint256) {
        if (!_priceData[asset].isActive) revert AssetNotActive();
        return _priceData[asset].updateInterval;
    }

    /**
     * @notice Checks if an asset is active
     * @param asset The address of the asset
     * @return Whether the asset is active
     */
    function isAssetActive(address asset) external view returns (bool) {
        return _priceData[asset].isActive;
    }

    /**
     * @notice Pauses the oracle
     * @dev Only callable by the owner
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses the oracle
     * @dev Only callable by the owner
     */
    function unpause() external onlyOwner {
        _unpause();
    }
} 