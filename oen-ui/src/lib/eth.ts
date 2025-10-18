import { BrowserProvider, JsonRpcProvider, Wallet, Contract, formatEther, parseUnits } from 'ethers';
import { CONFIG } from '../config';
import { edgeAbi, jobAbi, stakingAbi } from './abis';

const KEY = 'oen:pk';

export function getPrivateKey(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setPrivateKey(pk: string) {
  localStorage.setItem(KEY, pk);
}
export function clearPrivateKey() { localStorage.removeItem(KEY); }

export function fmt(x: bigint) { return formatEther(x); }
export function parseEdge(x: string) { return parseUnits(x, 18); }

export function rpcProvider() {
  return new JsonRpcProvider(CONFIG.rpcUrl);
}

export function wallet() {
  const pk = getPrivateKey();
  if (!pk || !pk.startsWith('0x') || pk.length !== 66) throw new Error('No private key in localStorage');
  return new Wallet(pk, rpcProvider());
}

// read-only contracts
export function edgeTokenRO()  { return new Contract(CONFIG.contracts.EdgeToken,    edgeAbi,  rpcProvider()); }
export function jobRegistryRO() { return new Contract(CONFIG.contracts.JobRegistry,  jobAbi,   rpcProvider()); }
export function stakingRO()     { return new Contract(CONFIG.contracts.StakingManager, stakingAbi, rpcProvider()); }

// signer-bound contracts (if you need a signer explicitly)
export function edgeToken(w = wallet())  { return new Contract(CONFIG.contracts.EdgeToken,    edgeAbi,  w); }
export function jobRegistry(w = wallet()) { return new Contract(CONFIG.contracts.JobRegistry,  jobAbi,   w); }
export function staking(w = wallet())     { return new Contract(CONFIG.contracts.StakingManager, stakingAbi, w); }

// Optional admin faucet (dev only)
export async function faucetToCurrent(amountEDGE: string) {
  if (!CONFIG.adminKey) throw new Error('No adminKey in CONFIG');
  const admin = new Wallet(CONFIG.adminKey, rpcProvider());
  const token = new Contract(CONFIG.contracts.EdgeToken, edgeAbi, admin);
  const to = wallet().address;
  const tx = await token.transfer(to, parseEdge(amountEDGE));
  await tx.wait();
  return to;
}
