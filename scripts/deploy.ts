import { ethers } from "hardhat";

/**
 * Deploy ERC8242SpatialRegistry to the configured network.
 *
 * Usage:
 *   # Hardhat local node
 *   npx hardhat run scripts/deploy.ts
 *
 *   # Base Sepolia testnet
 *   npx hardhat run scripts/deploy.ts --network baseSepolia
 *
 *   # Base mainnet
 *   npx hardhat run scripts/deploy.ts --network base
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying ERC8242SpatialRegistry with ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  const Factory  = await ethers.getContractFactory("ERC8242SpatialRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log(`\nERC8242SpatialRegistry deployed to: ${address}`);
  console.log(`\nTo verify on Basescan:`);
  console.log(`  npx hardhat verify --network baseSepolia ${address}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
