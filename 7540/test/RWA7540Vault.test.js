const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RWA7540Vault", function () {
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
        const RWA7540Oracle = await ethers.getContractFactory("RWA7540Oracle");
        oracle = await RWA7540Oracle.deploy();
        
        // Deploy vault
        const RWA7540Vault = await ethers.getContractFactory("RWA7540Vault");
        vault = await RWA7540Vault.deploy(
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

    describe("Async Deposit", function () {
        it("Should initiate and complete deposit", async function () {
            const depositAmount = ethers.parseUnits("100", 6);
            
            // Initiate deposit
            const tx = await vault.connect(user1).initiateDeposit(depositAmount, user1.address);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === "AsyncDepositInitiated");
            const operationId = event.args.operationId;
            
            // Complete deposit
            await expect(vault.connect(user1).completeDeposit(operationId))
                .to.emit(vault, "AsyncOperationCompleted")
                .withArgs(operationId, user1.address, depositAmount - (depositAmount * BigInt(FEE) / BigInt(10000)), true);
            
            // Check balances
            expect(await vault.balanceOf(user1.address)).to.equal(depositAmount - (depositAmount * BigInt(FEE) / BigInt(10000)));
            expect(await vault.totalFees()).to.equal(depositAmount * BigInt(FEE) / BigInt(10000));
        });

        it("Should not allow deposit below minimum", async function () {
            const depositAmount = ethers.parseUnits("50", 6);
            await expect(
                vault.connect(user1).initiateDeposit(depositAmount, user1.address)
            ).to.be.revertedWith("Below min deposit");
        });

        it("Should not allow completing non-existent operation", async function () {
            await expect(
                vault.connect(user1).completeDeposit(999)
            ).to.be.revertedWith("Operation not found");
        });

        it("Should not allow completing operation twice", async function () {
            const depositAmount = ethers.parseUnits("100", 6);
            
            // Initiate and complete deposit
            const tx = await vault.connect(user1).initiateDeposit(depositAmount, user1.address);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === "AsyncDepositInitiated");
            const operationId = event.args.operationId;
            
            await vault.connect(user1).completeDeposit(operationId);
            
            // Try to complete again
            await expect(
                vault.connect(user1).completeDeposit(operationId)
            ).to.be.revertedWith("Operation already completed");
        });
    });

    describe("Async Redeem", function () {
        beforeEach(async function () {
            // First deposit some assets
            const depositAmount = ethers.parseUnits("100", 6);
            const tx = await vault.connect(user1).initiateDeposit(depositAmount, user1.address);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === "AsyncDepositInitiated");
            const operationId = event.args.operationId;
            await vault.connect(user1).completeDeposit(operationId);
        });

        it("Should initiate and complete redeem", async function () {
            const redeemAmount = ethers.parseUnits("50", 6);
            
            // Initiate redeem
            const tx = await vault.connect(user1).initiateRedeem(redeemAmount, user1.address, user1.address);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === "AsyncRedeemInitiated");
            const operationId = event.args.operationId;
            
            // Complete redeem
            await expect(vault.connect(user1).completeRedeem(operationId))
                .to.emit(vault, "AsyncOperationCompleted")
                .withArgs(operationId, user1.address, redeemAmount, false);
            
            // Check balances
            expect(await vault.balanceOf(user1.address)).to.equal(ethers.parseUnits("50", 6) - (ethers.parseUnits("100", 6) * BigInt(FEE) / BigInt(10000)));
        });

        it("Should not allow redeem with zero shares", async function () {
            await expect(
                vault.connect(user1).initiateRedeem(0, user1.address, user1.address)
            ).to.be.revertedWith("Invalid shares");
        });

        it("Should not allow completing non-existent redeem operation", async function () {
            await expect(
                vault.connect(user1).completeRedeem(999)
            ).to.be.revertedWith("Operation not found");
        });

        it("Should not allow completing wrong operation type", async function () {
            const depositAmount = ethers.parseUnits("100", 6);
            
            // Initiate deposit
            const tx = await vault.connect(user1).initiateDeposit(depositAmount, user1.address);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === "AsyncDepositInitiated");
            const operationId = event.args.operationId;
            
            // Try to complete as redeem
            await expect(
                vault.connect(user1).completeRedeem(operationId)
            ).to.be.revertedWith("Not a redeem operation");
        });
    });

    describe("Fee Management", function () {
        it("Should collect fees correctly", async function () {
            const depositAmount = ethers.parseUnits("100", 6);
            
            // Initiate and complete deposit
            const tx = await vault.connect(user1).initiateDeposit(depositAmount, user1.address);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === "AsyncDepositInitiated");
            const operationId = event.args.operationId;
            await vault.connect(user1).completeDeposit(operationId);
            
            const expectedFees = depositAmount * BigInt(FEE) / BigInt(10000);
            expect(await vault.totalFees()).to.equal(expectedFees);
            
            // Collect fees
            await expect(vault.collectFees())
                .to.emit(vault, "FeesCollected")
                .withArgs(expectedFees);
            
            expect(await vault.totalFees()).to.equal(0);
            expect(await asset.balanceOf(owner.address)).to.equal(expectedFees);
        });

        it("Should update fee correctly", async function () {
            const newFee = 100; // 1%
            await expect(vault.setFee(newFee))
                .to.emit(vault, "FeeUpdated")
                .withArgs(newFee);
            
            expect(await vault.fee()).to.equal(newFee);
        });

        it("Should not allow fee above 100%", async function () {
            await expect(
                vault.setFee(10001)
            ).to.be.revertedWith("Fee too high");
        });
    });

    describe("Pausable", function () {
        it("Should pause and unpause", async function () {
            await vault.pause();
            
            const depositAmount = ethers.parseUnits("100", 6);
            await expect(
                vault.connect(user1).initiateDeposit(depositAmount, user1.address)
            ).to.be.revertedWith("Pausable: paused");
            
            await vault.unpause();
            await expect(vault.connect(user1).initiateDeposit(depositAmount, user1.address))
                .to.emit(vault, "AsyncDepositInitiated");
        });

        it("Should not allow non-owner to pause", async function () {
            await expect(
                vault.connect(user1).pause()
            ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
        });
    });

    describe("Price Integration", function () {
        it("Should get current price from oracle", async function () {
            expect(await vault.getCurrentPrice()).to.equal(INITIAL_PRICE);
            
            // Update price
            const newPrice = ethers.parseUnits("1.1", 6);
            await ethers.provider.send("evm_increaseTime", [ONE_WEEK + 1]);
            await ethers.provider.send("evm_mine");
            await oracle.updatePrice(vault.target, newPrice);
            
            expect(await vault.getCurrentPrice()).to.equal(newPrice);
        });
    });
}); 