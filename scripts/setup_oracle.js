const hre = require("hardhat");

async function main() {
  // Get the oracle contract
  const oracleAddress = process.env.ORACLE_ADDRESS;
  if (!oracleAddress) {
    throw new Error("Please set ORACLE_ADDRESS environment variable");
  }

  const oracle = await hre.ethers.getContractAt("RWA4626Oracle", oracleAddress);

  // Get the vault contract
  const vaultAddress = process.env.VAULT_ADDRESS;
  if (!vaultAddress) {
    throw new Error("Please set VAULT_ADDRESS environment variable");
  }

  // One week in seconds
  const ONE_WEEK = 7 * 24 * 60 * 60;

  // Add the vault as an asset to the oracle with 1-week update interval
  const initialPrice = hre.ethers.parseUnits("1", 6); // $1.00 with 6 decimals
  const tx = await oracle.addAsset(vaultAddress, initialPrice, ONE_WEEK);
  await tx.wait();

  console.log(`Added vault ${vaultAddress} to oracle with 1-week update interval`);
  console.log(`Initial price set to $1.00 (${initialPrice})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 