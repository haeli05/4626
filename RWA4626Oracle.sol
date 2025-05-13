// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RWA4626Oracle
 * @dev Oracle contract for RWA4626 vaults that manages price updates
 */
contract RWA4626Oracle is Ownable {
    // Mapping from vault address to price
    mapping(address => uint256) private _prices;
    
    // Mapping from vault address to last update timestamp
    mapping(address => uint256) private _lastUpdates;
    
    // Minimum time between updates (24 hours)
    uint256 private constant MIN_UPDATE_INTERVAL = 24 hours;
    
    // Events
    event PriceUpdated(address indexed vault, uint256 oldPrice, uint256 newPrice);
    
    // Errors
    error UpdateTooFrequent();
    error InvalidPrice();
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Update the price for a vault
     * @param vault The address of the vault
     * @param newPrice The new price in USDC (6 decimals)
     */
    function updatePrice(address vault, uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert InvalidPrice();
        
        // Check if enough time has passed since last update
        if (block.timestamp < _lastUpdates[vault] + MIN_UPDATE_INTERVAL) {
            revert UpdateTooFrequent();
        }
        
        uint256 oldPrice = _prices[vault];
        _prices[vault] = newPrice;
        _lastUpdates[vault] = block.timestamp;
        
        emit PriceUpdated(vault, oldPrice, newPrice);
    }
    
    /**
     * @dev Get the current price for a vault
     * @param vault The address of the vault
     * @return The current price in USDC (6 decimals)
     */
    function getPrice(address vault) external view returns (uint256) {
        return _prices[vault];
    }
    
    /**
     * @dev Get the last update timestamp for a vault
     * @param vault The address of the vault
     * @return The timestamp of the last update
     */
    function getLastUpdate(address vault) external view returns (uint256) {
        return _lastUpdates[vault];
    }
    
    /**
     * @dev Check if a price update is allowed
     * @param vault The address of the vault
     * @return Whether an update is allowed
     */
    function canUpdate(address vault) external view returns (bool) {
        return block.timestamp >= _lastUpdates[vault] + MIN_UPDATE_INTERVAL;
    }
} 