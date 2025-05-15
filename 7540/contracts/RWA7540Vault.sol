// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./RWA7540Oracle.sol";

contract RWA7540Vault is ERC4626, Ownable, Pausable {
    RWA7540Oracle public immutable oracle;
    uint256 public immutable minDeposit;
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public fee;
    uint256 public totalFees;

    // Async operation tracking
    struct AsyncOperation {
        address user;
        uint256 amount;
        uint256 timestamp;
        bool isDeposit;
    }

    mapping(uint256 => AsyncOperation) public asyncOperations;
    uint256 public nextOperationId;

    // Events
    event FeeUpdated(uint256 newFee);
    event AsyncDepositInitiated(uint256 indexed operationId, address indexed user, uint256 amount);
    event AsyncRedeemInitiated(uint256 indexed operationId, address indexed user, uint256 amount);
    event AsyncOperationCompleted(uint256 indexed operationId, address indexed user, uint256 amount, bool isDeposit);
    event FeesCollected(uint256 amount);

    constructor(
        IERC20 asset_,
        string memory name,
        string memory symbol,
        address oracle_,
        uint256 minDeposit_,
        uint256 fee_
    ) ERC4626(asset_) ERC20(name, symbol) Ownable(msg.sender) {
        require(oracle_ != address(0), "Invalid oracle address");
        require(minDeposit_ > 0, "Invalid min deposit");
        require(fee_ <= FEE_DENOMINATOR, "Fee too high");

        oracle = RWA7540Oracle(oracle_);
        minDeposit = minDeposit_;
        fee = fee_;
    }

    /**
     * @dev Initiate an asynchronous deposit
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive the shares
     * @return operationId The ID of the initiated operation
     */
    function initiateDeposit(uint256 assets, address receiver) external whenNotPaused returns (uint256 operationId) {
        require(assets >= minDeposit, "Below min deposit");
        require(receiver != address(0), "Invalid receiver");

        // Transfer assets from user
        SafeERC20.safeTransferFrom(IERC20(asset()), msg.sender, address(this), assets);

        operationId = nextOperationId++;
        asyncOperations[operationId] = AsyncOperation({
            user: receiver,
            amount: assets,
            timestamp: block.timestamp,
            isDeposit: true
        });

        emit AsyncDepositInitiated(operationId, receiver, assets);
        return operationId;
    }

    /**
     * @dev Complete an asynchronous deposit
     * @param operationId The ID of the operation to complete
     */
    function completeDeposit(uint256 operationId) external whenNotPaused {
        AsyncOperation storage operation = asyncOperations[operationId];
        require(operation.user != address(0), "Operation not found");
        require(operation.isDeposit, "Not a deposit operation");
        require(!_isCompleted(operationId), "Operation already completed");

        uint256 assets = operation.amount;
        uint256 feeAmount = (assets * fee) / FEE_DENOMINATOR;
        uint256 assetsAfterFee = assets - feeAmount;
        
        totalFees += feeAmount;
        
        // Mint shares to user
        _mint(operation.user, assetsAfterFee);

        emit AsyncOperationCompleted(operationId, operation.user, assetsAfterFee, true);
        _markCompleted(operationId);
    }

    /**
     * @dev Initiate an asynchronous redeem
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive the assets
     * @param owner Address that owns the shares
     * @return operationId The ID of the initiated operation
     */
    function initiateRedeem(
        uint256 shares,
        address receiver,
        address owner
    ) external whenNotPaused returns (uint256 operationId) {
        require(shares > 0, "Invalid shares");
        require(receiver != address(0), "Invalid receiver");
        require(owner != address(0), "Invalid owner");

        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        // Burn shares from owner
        _burn(owner, shares);

        operationId = nextOperationId++;
        asyncOperations[operationId] = AsyncOperation({
            user: receiver,
            amount: shares,
            timestamp: block.timestamp,
            isDeposit: false
        });

        emit AsyncRedeemInitiated(operationId, receiver, shares);
        return operationId;
    }

    /**
     * @dev Complete an asynchronous redeem
     * @param operationId The ID of the operation to complete
     */
    function completeRedeem(uint256 operationId) external whenNotPaused {
        AsyncOperation storage operation = asyncOperations[operationId];
        require(operation.user != address(0), "Operation not found");
        require(!operation.isDeposit, "Not a redeem operation");
        require(!_isCompleted(operationId), "Operation already completed");

        uint256 shares = operation.amount;
        uint256 assets = convertToAssets(shares);
        
        // Transfer assets to user
        SafeERC20.safeTransfer(IERC20(asset()), operation.user, assets);

        emit AsyncOperationCompleted(operationId, operation.user, assets, false);
        _markCompleted(operationId);
    }

    /**
     * @dev Update the fee percentage
     * @param newFee New fee percentage (in basis points)
     */
    function setFee(uint256 newFee) external onlyOwner {
        require(newFee <= FEE_DENOMINATOR, "Fee too high");
        fee = newFee;
        emit FeeUpdated(newFee);
    }

    /**
     * @dev Collect accumulated fees
     */
    function collectFees() external onlyOwner {
        uint256 amount = totalFees;
        totalFees = 0;
        SafeERC20.safeTransfer(IERC20(asset()), owner(), amount);
        emit FeesCollected(amount);
    }

    /**
     * @dev Pause the vault
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the vault
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Check if an operation is completed
     * @param operationId The ID of the operation to check
     */
    function _isCompleted(uint256 operationId) internal view returns (bool) {
        return asyncOperations[operationId].timestamp == 0;
    }

    /**
     * @dev Mark an operation as completed
     * @param operationId The ID of the operation to mark
     */
    function _markCompleted(uint256 operationId) internal {
        delete asyncOperations[operationId];
    }

    /**
     * @dev Get the current price from the oracle
     */
    function getCurrentPrice() public view returns (uint256) {
        (uint256 price,) = oracle.getPrice(address(this));
        return price;
    }

    /**
     * @dev Override previewDeposit to include fee calculation
     */
    function previewDeposit(uint256 assets) public view override returns (uint256) {
        uint256 feeAmount = (assets * fee) / FEE_DENOMINATOR;
        return assets - feeAmount;
    }

    /**
     * @dev Override previewMint to include fee calculation
     */
    function previewMint(uint256 shares) public view override returns (uint256) {
        return (shares * FEE_DENOMINATOR) / (FEE_DENOMINATOR - fee);
    }

    /**
     * @dev Override previewRedeem to include fee calculation
     */
    function previewRedeem(uint256 shares) public view override returns (uint256) {
        return shares;
    }

    /**
     * @dev Override previewWithdraw to include fee calculation
     */
    function previewWithdraw(uint256 assets) public view override returns (uint256) {
        return assets;
    }
} 