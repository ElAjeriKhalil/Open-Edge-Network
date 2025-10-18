// src/lib/contracts.ts
import {
  Contract,
  type ContractRunner,
  type ContractTransactionResponse,
} from 'ethers';
import { stakingAbi } from '../lib/abis';

export type StakingManager = Contract & {
  registerNodeSigned(
    worker: string,
    gpuHash: string,
    benchScore: bigint,
    expiresAt: bigint,
    nonce: bigint,
    sig: string
  ): Promise<ContractTransactionResponse>;

  metaNonces(addr: string): Promise<bigint>;

  // returns (bytes32, uint256, uint64) → [gpuHash, benchScore, createdAt]
  getNodeMeta(addr: string): Promise<[string, bigint, bigint]>;
};

export function stakingManager(
  address: string,
  runner: ContractRunner
): StakingManager {
  return new Contract(address, stakingAbi, runner) as StakingManager;
}
