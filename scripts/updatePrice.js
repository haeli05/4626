const hre = require("hardhat");

async function main() {
    // Get command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error("Usage: npx hardhat run scripts/updatePrice.js --network <network> <oracle-address> <new-price>");
        process.exit(1);
    }

    const [oracleAddress, newPrice] = args;
    
    // Get signer
    const [signer] = await hre.ethers.getSigners();
    console.log("Using account:", signer.address);
    
    // Get oracle contract
    const Oracle = await hre.ethers.getContractFactory("RWA4626Oracle");
    const oracle = Oracle.attach(oracleAddress);
    
    // Check if update is allowed
    const canUpdate = await oracle.canUpdate(oracleAddress);
    if (!canUpdate) {
        const lastUpdate = await oracle.getLastUpdate(oracleAddress);
        const nextUpdate = lastUpdate + 24 * 60 * 60; // 24 hours in seconds
        console.error(`Update not allowed. Next update possible at timestamp: ${nextUpdate}`);
        process.exit(1);
    }
    
    // Get current price
    const currentPrice = await oracle.getPrice(oracleAddress);
    console.log("Current price:", currentPrice);
    console.log("New price:", newPrice);
    
    // Update price
    console.log("Updating price...");
    const tx = await oracle.updatePrice(oracleAddress, newPrice);
    const receipt = await tx.wait();
    
    // Find PriceUpdated event
    const event = receipt.events.find(e => e.event === "PriceUpdated");
    if (event) {
        console.log("Price updated successfully!");
        console.log("Old price:", event.args.oldPrice.toString());
        console.log("New price:", event.args.newPrice.toString());
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 