// Import the Hardhat toolbox which includes common plugins and tasks
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // Set Solidity version to 0.8.20 for all contracts
  solidity: "0.8.20",
  
  // Network configurations
  networks: {
    // Local development network configuration
    localhost: {
      // URL for the local Hardhat network
      url: "http://127.0.0.1:8545"
    }
    // Add other networks (mainnet, testnet, etc.) here as needed
  }
}; 