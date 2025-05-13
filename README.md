# RWA4626 Vault

An implementation of the ERC4626 tokenized vault standard for Real World Assets (RWA). This vault allows users to deposit stablecoins and receive RWA shares, which represent their ownership in the underlying assets.

## Features

- ERC4626 compliant tokenized vault
- Support for stablecoin deposits and withdrawals
- Price ratio mechanism for RWA assets
- Staking functionality
- Admin controls for price updates and emergency actions
- Pausable functionality for emergency situations
- Reentrancy protection

## Installation

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile
```

## Contract Overview

The `RWA4626Vault` contract implements the ERC4626 standard and provides the following main functionalities:

- Deposit assets and receive shares
- Withdraw assets by burning shares
- Mint shares by depositing assets
- Redeem shares for assets
- Stake and unstake functionality
- Price updates for RWA assets
- Admin controls for emergency situations

## Security Features

- ReentrancyGuard for protection against reentrancy attacks
- Pausable functionality for emergency stops
- Owner-only admin functions
- SafeERC20 for secure token transfers
- Minimum deposit requirements

## License

MIT 