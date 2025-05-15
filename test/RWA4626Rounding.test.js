const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RWA4626Vault Rounding", function () {
    let vault;
    let oracle;
    let asset; // Mock USDC
    let owner;
    let user1;
    
    const INITIAL_PRICE = ethers.parseUnits("1", 6); // $1.00
    const MIN_DEPOSIT = ethers.parseUnits("100", 6); // 100 USDC
    const FEE = 50; // 0.5%
    const ONE_WEEK = 7 * 24 * 60 * 60;
    
    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();
        
        // Deploy mock USDC
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        asset = await MockERC20.deploy("Mock USDC", "USDC", 6);
        
        // Deploy oracle
        const RWA4626Oracle = await ethers.getContractFactory("RWA4626Oracle");
        oracle = await RWA4626Oracle.deploy();
        
        // Deploy vault
        const RWA4626Vault = await ethers.getContractFactory("RWA4626Vault");
        vault = await RWA4626Vault.deploy(
            asset.target,
            "RWA Vault",
            "RWA",
            oracle.target,
            MIN_DEPOSIT,
            FEE
        );
        
        // Setup oracle
        await oracle.addAsset(vault.target, INITIAL_PRICE, ONE_WEEK);
        
        // Mint USDC to user
        await asset.mint(user1.address, ethers.parseUnits("1000", 6));
        
        // Approve vault to spend USDC
        await asset.connect(user1).approve(vault.target, ethers.parseUnits("1000", 6));
    });

    describe("Rounding Behavior", function () {
        it("Should round down when depositing assets", async function () {
            // Deposit 100.5 USDC
            const depositAmount = ethers.parseUnits("100.5", 6);
            const shares = await vault.connect(user1).deposit(depositAmount, user1.address);
            
            // Should get 100 shares (rounds down)
            expect(shares).to.equal(ethers.parseUnits("100", 6));
        });

        it("Should round up when minting shares", async function () {
            // Try to mint 100.5 shares
            const mintAmount = ethers.parseUnits("100.5", 6);
            const assets = await vault.connect(user1).mint(mintAmount, user1.address);
            
            // Should need 101 assets (rounds up)
            expect(assets).to.equal(ethers.parseUnits("101", 6));
        });

        it("Should round down when redeeming shares", async function () {
            // First deposit some assets
            await vault.connect(user1).deposit(ethers.parseUnits("100", 6), user1.address);
            
            // Try to redeem 100.5 shares
            const redeemAmount = ethers.parseUnits("100.5", 6);
            const assets = await vault.connect(user1).redeem(redeemAmount, user1.address, user1.address);
            
            // Should get 100 assets (rounds down)
            expect(assets).to.equal(ethers.parseUnits("100", 6));
        });

        it("Should round up when withdrawing assets", async function () {
            // First deposit some assets
            await vault.connect(user1).deposit(ethers.parseUnits("100", 6), user1.address);
            
            // Try to withdraw 100.5 assets
            const withdrawAmount = ethers.parseUnits("100.5", 6);
            const shares = await vault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);
            
            // Should need 101 shares (rounds up)
            expect(shares).to.equal(ethers.parseUnits("101", 6));
        });

        it("Should maintain consistent rounding with price changes", async function () {
            // First deposit some assets
            await vault.connect(user1).deposit(ethers.parseUnits("100", 6), user1.address);
            
            // Fast forward time to allow price update
            await ethers.provider.send("evm_increaseTime", [ONE_WEEK + 1]);
            await ethers.provider.send("evm_mine");
            
            // Update price to $1.10
            const newPrice = ethers.parseUnits("1.1", 6);
            await oracle.updatePrice(vault.target, newPrice);
            
            // Try to withdraw 100.5 assets
            const withdrawAmount = ethers.parseUnits("100.5", 6);
            const shares = await vault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);
            
            // Should need more shares due to higher price (rounds up)
            const expectedShares = withdrawAmount * BigInt(1e6) / newPrice;
            expect(shares).to.equal(expectedShares + BigInt(1)); // Rounds up
        });

        it("Should handle rounding with fees correctly", async function () {
            // Deposit 100.5 USDC
            const depositAmount = ethers.parseUnits("100.5", 6);
            const shares = await vault.connect(user1).deposit(depositAmount, user1.address);
            
            // Calculate expected fee (0.5% of 100.5 = 0.5025, rounds down to 0.50)
            const expectedFee = depositAmount * BigInt(FEE) / BigInt(10000);
            
            // Check total fees
            expect(await vault.totalFees()).to.equal(expectedFee);
            
            // Check shares received (should be less than deposit due to fee and rounding)
            expect(shares).to.be.below(depositAmount);
        });
    });
}); 