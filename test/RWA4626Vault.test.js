const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RWA4626Vault", function () {
    let vault;
    let oracle;
    let asset; // Mock USDC
    let owner;
    let user1;
    let user2;
    
    const INITIAL_PRICE = ethers.parseUnits("1", 6); // $1.00
    const MIN_DEPOSIT = ethers.parseUnits("100", 6); // 100 USDC
    const FEE = 50; // 0.5%
    const ONE_WEEK = 7 * 24 * 60 * 60;
    
    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        
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
        
        // Mint USDC to users
        await asset.mint(user1.address, ethers.parseUnits("1000", 6));
        await asset.mint(user2.address, ethers.parseUnits("1000", 6));
        
        // Approve vault to spend USDC
        await asset.connect(user1).approve(vault.target, ethers.parseUnits("1000", 6));
        await asset.connect(user2).approve(vault.target, ethers.parseUnits("1000", 6));
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await vault.owner()).to.equal(owner.address);
        });

        it("Should set the correct initial values", async function () {
            expect(await vault.oracle()).to.equal(oracle.target);
            expect(await vault.minDeposit()).to.equal(MIN_DEPOSIT);
            expect(await vault.fee()).to.equal(FEE);
        });
    });

    describe("Share Calculations", function () {
        it("Should calculate shares correctly at $1.00 price", async function () {
            const depositAmount = ethers.parseUnits("100", 6);
            const expectedShares = depositAmount; // 1:1 ratio at $1.00
            
            await vault.connect(user1).deposit(depositAmount, user1.address);
            expect(await vault.balanceOf(user1.address)).to.equal(expectedShares);
        });

        it("Should calculate shares correctly at $1.10 price", async function () {
            // Fast forward time to allow price update
            await ethers.provider.send("evm_increaseTime", [ONE_WEEK + 1]);
            await ethers.provider.send("evm_mine");
            
            const newPrice = ethers.parseUnits("1.1", 6);
            await oracle.updatePrice(vault.target, newPrice);
            
            const depositAmount = ethers.parseUnits("100", 6);
            const expectedShares = depositAmount * BigInt(1e6) / newPrice;
            
            await vault.connect(user1).deposit(depositAmount, user1.address);
            expect(await vault.balanceOf(user1.address)).to.equal(expectedShares);
        });
    });

    describe("Deposits", function () {
        it("Should revert if deposit amount is below minimum", async function () {
            const smallDeposit = ethers.parseUnits("50", 6);
            await expect(
                vault.connect(user1).deposit(smallDeposit, user1.address)
            ).to.be.revertedWithCustomError(vault, "DepositTooSmall");
        });

        it("Should collect fees on deposit", async function () {
            const depositAmount = ethers.parseUnits("100", 6);
            const expectedFee = depositAmount * BigInt(FEE) / BigInt(10000);
            
            await vault.connect(user1).deposit(depositAmount, user1.address);
            expect(await vault.totalFees()).to.equal(expectedFee);
        });
    });

    describe("Withdrawals", function () {
        it("Should allow withdrawal of assets", async function () {
            const depositAmount = ethers.parseUnits("100", 6);
            await vault.connect(user1).deposit(depositAmount, user1.address);
            
            const balanceBefore = await asset.balanceOf(user1.address);
            await vault.connect(user1).withdraw(depositAmount, user1.address, user1.address);
            const balanceAfter = await asset.balanceOf(user1.address);
            
            expect(balanceAfter - balanceBefore).to.equal(depositAmount);
        });
    });

    describe("Price Updates", function () {
        it("Should revert operations if price update is required", async function () {
            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [ONE_WEEK + 1]);
            await ethers.provider.send("evm_mine");
            
            const depositAmount = ethers.parseUnits("100", 6);
            await expect(
                vault.connect(user1).deposit(depositAmount, user1.address)
            ).to.be.revertedWithCustomError(vault, "PriceUpdateRequired");
        });
    });
}); 