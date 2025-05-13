const hre = require("hardhat");

async function main() {
    // Get command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error("Usage: npx hardhat run scripts/check_price.js --network <network> <oracle-address> <vault-address>");
        process.exit(1);
    }

    const [oracleAddress, vaultAddress] = args;
    
    // Get oracle contract
    const Oracle = await hre.ethers.getContractFactory("RWA4626Oracle");
    const oracle = Oracle.attach(oracleAddress);
    
    // Get current price
    const currentPrice = await oracle.getPrice(vaultAddress);
    console.log("Current price:", currentPrice);
    
    // Get last update timestamp
    const lastUpdate = await oracle.getLastUpdate(vaultAddress);
    const lastUpdateDate = new Date(lastUpdate * 1000);
    console.log("Last update:", lastUpdateDate.toLocaleString());
    
    // Check if update is allowed
    const canUpdate = await oracle.canUpdate(vaultAddress);
    if (canUpdate) {
        console.log("Price can be updated now");
    } else {
        const nextUpdate = lastUpdate + 24 * 60 * 60; // 24 hours in seconds
        const nextUpdateDate = new Date(nextUpdate * 1000);
        console.log("Next update possible at:", nextUpdateDate.toLocaleString());
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 