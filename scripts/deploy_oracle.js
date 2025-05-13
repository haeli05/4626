const hre = require("hardhat");

async function main() {
    console.log("Deploying RWA4626Oracle...");
    
    // Get signer
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Deploy oracle
    const Oracle = await hre.ethers.getContractFactory("RWA4626Oracle");
    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    
    const oracleAddress = await oracle.getAddress();
    console.log("RWA4626Oracle deployed to:", oracleAddress);
    
    // Verify contract on Etherscan if on a supported network
    if (hre.network.name !== "hardhat") {
        console.log("Waiting for 6 block confirmations...");
        await oracle.deploymentTransaction().wait(6);
        
        console.log("Verifying contract on Etherscan...");
        try {
            await hre.run("verify:verify", {
                address: oracleAddress,
                constructorArguments: [],
            });
            console.log("Contract verified successfully!");
        } catch (error) {
            console.error("Verification failed:", error);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 