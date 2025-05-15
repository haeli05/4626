# EIP7540 Implementation

This project implements EIP7540, which extends ERC-4626 vaults with price oracle functionality. The implementation allows vaults to maintain accurate pricing information for their underlying assets.

## Features

- ERC-4626 compliant vault implementation
- Price oracle integration
- Rounding behavior tests
- Comprehensive test suite

## Setup

1. Install dependencies:
```bash
npm install
```

2. Compile contracts:
```bash
npm run compile
```

3. Run tests:
```bash
npm test
```

## Contract Structure

- `RWA7540Vault.sol`: Main vault implementation
- `RWA7540Oracle.sol`: Price oracle implementation
- `MockERC20.sol`: Mock token for testing

## Testing

The test suite includes comprehensive tests for:
- Rounding behavior
- Price oracle integration
- Deposit/withdrawal operations
- Fee calculations

## License

MIT 