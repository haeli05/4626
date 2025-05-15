const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RWA7540Oracle", function () {
    let oracle;
    let owner;
    let user1;
    let vault;
    
    const INITIAL_PRICE = ethers.parseUnits("1", 6); // $1.00
    const UPDATE_DELAY = 7 * 24 * 60 * 60; // 1 week
    
    beforeEach(async function () {
        [owner, user1, vault] = await ethers.getSigners();
        
        const RWA7540Oracle = await ethers.getContractFactory("RWA7540Oracle");
        oracle = await RWA7540Oracle.deploy();
    });

    describe("Asset Management", function () {
        it("Should add a new asset", async function () {
            await expect(oracle.addAsset(vault.address, INITIAL_PRICE, UPDATE_DELAY))
                .to.emit(oracle, "AssetAdded")
                .withArgs(vault.address, INITIAL_PRICE, UPDATE_DELAY);
            
            const assetPrice = await oracle.assetPrices(vault.address);
            expect(assetPrice.price).to.equal(INITIAL_PRICE);
            expect(assetPrice.isActive).to.be.true;
        });

        it("Should not allow non-owner to add asset", async function () {
            await expect(
                oracle.connect(user1).addAsset(vault.address, INITIAL_PRICE, UPDATE_DELAY)
            ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
        });

        it("Should not allow adding asset with zero price", async function () {
            await expect(
                oracle.addAsset(vault.address, 0, UPDATE_DELAY)
            ).to.be.revertedWith("Invalid initial price");
        });

        it("Should not allow adding asset with zero delay", async function () {
            await expect(
                oracle.addAsset(vault.address, INITIAL_PRICE, 0)
            ).to.be.revertedWith("Invalid update delay");
        });

        it("Should not allow adding same asset twice", async function () {
            await oracle.addAsset(vault.address, INITIAL_PRICE, UPDATE_DELAY);
            await expect(
                oracle.addAsset(vault.address, INITIAL_PRICE, UPDATE_DELAY)
            ).to.be.revertedWith("Asset already exists");
        });
    });

    describe("Price Updates", function () {
        beforeEach(async function () {
            await oracle.addAsset(vault.address, INITIAL_PRICE, UPDATE_DELAY);
        });

        it("Should update price after delay", async function () {
            const newPrice = ethers.parseUnits("1.1", 6);
            
            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [UPDATE_DELAY + 1]);
            await ethers.provider.send("evm_mine");
            
            await expect(oracle.updatePrice(vault.address, newPrice))
                .to.emit(oracle, "PriceUpdated")
                .withArgs(vault.address, newPrice, await ethers.provider.getBlock("latest").then(b => b.timestamp));
            
            const assetPrice = await oracle.assetPrices(vault.address);
            expect(assetPrice.price).to.equal(newPrice);
        });

        it("Should not allow price update before delay", async function () {
            const newPrice = ethers.parseUnits("1.1", 6);
            await expect(
                oracle.updatePrice(vault.address, newPrice)
            ).to.be.revertedWith("Update too soon");
        });

        it("Should not allow non-owner to update price", async function () {
            const newPrice = ethers.parseUnits("1.1", 6);
            await expect(
                oracle.connect(user1).updatePrice(vault.address, newPrice)
            ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
        });

        it("Should not allow updating price for non-existent asset", async function () {
            const newPrice = ethers.parseUnits("1.1", 6);
            await expect(
                oracle.updatePrice(user1.address, newPrice)
            ).to.be.revertedWith("Asset not found");
        });
    });

    describe("Price Queries", function () {
        beforeEach(async function () {
            await oracle.addAsset(vault.address, INITIAL_PRICE, UPDATE_DELAY);
        });

        it("Should get correct price", async function () {
            const [price, lastUpdate] = await oracle.getPrice(vault.address);
            expect(price).to.equal(INITIAL_PRICE);
            expect(lastUpdate).to.equal(await ethers.provider.getBlock("latest").then(b => b.timestamp));
        });

        it("Should revert when querying non-existent asset", async function () {
            await expect(
                oracle.getPrice(user1.address)
            ).to.be.revertedWith("Asset not found");
        });
    });

    describe("Asset Removal", function () {
        beforeEach(async function () {
            await oracle.addAsset(vault.address, INITIAL_PRICE, UPDATE_DELAY);
        });

        it("Should remove asset", async function () {
            await expect(oracle.removeAsset(vault.address))
                .to.emit(oracle, "AssetRemoved")
                .withArgs(vault.address);
            
            await expect(
                oracle.getPrice(vault.address)
            ).to.be.revertedWith("Asset not found");
        });

        it("Should not allow non-owner to remove asset", async function () {
            await expect(
                oracle.connect(user1).removeAsset(vault.address)
            ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
        });
    });

    describe("Update Delay Management", function () {
        beforeEach(async function () {
            await oracle.addAsset(vault.address, INITIAL_PRICE, UPDATE_DELAY);
        });

        it("Should update delay", async function () {
            const newDelay = UPDATE_DELAY * 2;
            await expect(oracle.setUpdateDelay(vault.address, newDelay))
                .to.emit(oracle, "UpdateDelayChanged")
                .withArgs(vault.address, newDelay);
            
            const assetPrice = await oracle.assetPrices(vault.address);
            expect(assetPrice.updateDelay).to.equal(newDelay);
        });

        it("Should not allow non-owner to update delay", async function () {
            await expect(
                oracle.connect(user1).setUpdateDelay(vault.address, UPDATE_DELAY * 2)
            ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
        });

        it("Should not allow zero delay", async function () {
            await expect(
                oracle.setUpdateDelay(vault.address, 0)
            ).to.be.revertedWith("Invalid delay");
        });
    });

    describe("Pausable", function () {
        beforeEach(async function () {
            await oracle.addAsset(vault.address, INITIAL_PRICE, UPDATE_DELAY);
        });

        it("Should pause and unpause", async function () {
            await oracle.pause();
            const newPrice = ethers.parseUnits("1.1", 6);
            
            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [UPDATE_DELAY + 1]);
            await ethers.provider.send("evm_mine");
            
            await expect(
                oracle.updatePrice(vault.address, newPrice)
            ).to.be.revertedWith("Pausable: paused");
            
            await oracle.unpause();
            await expect(oracle.updatePrice(vault.address, newPrice))
                .to.emit(oracle, "PriceUpdated");
        });

        it("Should not allow non-owner to pause", async function () {
            await expect(
                oracle.connect(user1).pause()
            ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
        });
    });
}); 