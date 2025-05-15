const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RWA4626Oracle", function () {
    let oracle;
    let owner;
    let user1;
    let user2;
    
    const INITIAL_PRICE = ethers.parseUnits("1", 6); // $1.00
    const ONE_WEEK = 7 * 24 * 60 * 60;
    
    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        
        const RWA4626Oracle = await ethers.getContractFactory("RWA4626Oracle");
        oracle = await RWA4626Oracle.deploy();
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await oracle.owner()).to.equal(owner.address);
        });
    });

    describe("Asset Management", function () {
        it("Should allow owner to add asset", async function () {
            await oracle.addAsset(user1.address, INITIAL_PRICE, ONE_WEEK);
            
            expect(await oracle.getPrice(user1.address)).to.equal(INITIAL_PRICE);
            expect(await oracle.getUpdateInterval(user1.address)).to.equal(ONE_WEEK);
            expect(await oracle.isAssetActive(user1.address)).to.be.true;
        });

        it("Should not allow non-owner to add asset", async function () {
            await expect(
                oracle.connect(user1).addAsset(user2.address, INITIAL_PRICE, ONE_WEEK)
            ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
        });

        it("Should allow owner to remove asset", async function () {
            await oracle.addAsset(user1.address, INITIAL_PRICE, ONE_WEEK);
            await oracle.removeAsset(user1.address);
            
            expect(await oracle.isAssetActive(user1.address)).to.be.false;
        });
    });

    describe("Price Updates", function () {
        beforeEach(async function () {
            await oracle.addAsset(user1.address, INITIAL_PRICE, ONE_WEEK);
        });

        it("Should not allow price updates before interval", async function () {
            const newPrice = ethers.parseUnits("1.1", 6);
            await expect(
                oracle.updatePrice(user1.address, newPrice)
            ).to.be.revertedWithCustomError(oracle, "UpdateTooFrequent");
        });

        it("Should allow price updates after interval", async function () {
            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [ONE_WEEK + 1]);
            await ethers.provider.send("evm_mine");
            
            const newPrice = ethers.parseUnits("1.1", 6);
            await oracle.updatePrice(user1.address, newPrice);
            
            expect(await oracle.getPrice(user1.address)).to.equal(newPrice);
        });
    });

    describe("Update Interval", function () {
        beforeEach(async function () {
            await oracle.addAsset(user1.address, INITIAL_PRICE, ONE_WEEK);
        });

        it("Should allow owner to change update interval", async function () {
            const newInterval = ONE_WEEK * 2;
            await oracle.setUpdateInterval(user1.address, newInterval);
            
            expect(await oracle.getUpdateInterval(user1.address)).to.equal(newInterval);
        });

        it("Should not allow non-owner to change update interval", async function () {
            const newInterval = ONE_WEEK * 2;
            await expect(
                oracle.connect(user1).setUpdateInterval(user2.address, newInterval)
            ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
        });
    });
}); 