// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract RWA7540Oracle is Ownable, Pausable {
    struct AssetPrice {
        uint256 price;        // Price in USD (6 decimals)
        uint256 lastUpdate;   // Timestamp of last update
        uint256 updateDelay;  // Minimum time between updates
        bool isActive;        // Whether the asset is active
    }

    // Mapping of vault address to asset price data
    mapping(address => AssetPrice) public assetPrices;
    
    // Events
    event PriceUpdated(address indexed vault, uint256 price, uint256 timestamp);
    event AssetAdded(address indexed vault, uint256 initialPrice, uint256 updateDelay);
    event AssetRemoved(address indexed vault);
    event UpdateDelayChanged(address indexed vault, uint256 newDelay);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Add a new asset to track
     * @param vault The vault address to track
     * @param initialPrice Initial price in USD (6 decimals)
     * @param updateDelay Minimum time between price updates
     */
    function addAsset(address vault, uint256 initialPrice, uint256 updateDelay) external onlyOwner {
        require(vault != address(0), "Invalid vault address");
        require(initialPrice > 0, "Invalid initial price");
        require(updateDelay > 0, "Invalid update delay");
        require(!assetPrices[vault].isActive, "Asset already exists");

        assetPrices[vault] = AssetPrice({
            price: initialPrice,
            lastUpdate: block.timestamp,
            updateDelay: updateDelay,
            isActive: true
        });

        emit AssetAdded(vault, initialPrice, updateDelay);
    }

    /**
     * @dev Update the price for an asset
     * @param vault The vault address
     * @param newPrice New price in USD (6 decimals)
     */
    function updatePrice(address vault, uint256 newPrice) external onlyOwner whenNotPaused {
        require(assetPrices[vault].isActive, "Asset not found");
        require(newPrice > 0, "Invalid price");
        require(
            block.timestamp >= assetPrices[vault].lastUpdate + assetPrices[vault].updateDelay,
            "Update too soon"
        );

        assetPrices[vault].price = newPrice;
        assetPrices[vault].lastUpdate = block.timestamp;

        emit PriceUpdated(vault, newPrice, block.timestamp);
    }

    /**
     * @dev Get the current price for an asset
     * @param vault The vault address
     * @return price Current price in USD (6 decimals)
     * @return lastUpdate Timestamp of last update
     */
    function getPrice(address vault) external view returns (uint256 price, uint256 lastUpdate) {
        require(assetPrices[vault].isActive, "Asset not found");
        return (assetPrices[vault].price, assetPrices[vault].lastUpdate);
    }

    /**
     * @dev Remove an asset from tracking
     * @param vault The vault address to remove
     */
    function removeAsset(address vault) external onlyOwner {
        require(assetPrices[vault].isActive, "Asset not found");
        delete assetPrices[vault];
        emit AssetRemoved(vault);
    }

    /**
     * @dev Update the minimum time between price updates
     * @param vault The vault address
     * @param newDelay New minimum time between updates
     */
    function setUpdateDelay(address vault, uint256 newDelay) external onlyOwner {
        require(assetPrices[vault].isActive, "Asset not found");
        require(newDelay > 0, "Invalid delay");
        assetPrices[vault].updateDelay = newDelay;
        emit UpdateDelayChanged(vault, newDelay);
    }

    /**
     * @dev Pause the oracle
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the oracle
     */
    function unpause() external onlyOwner {
        _unpause();
    }
} 