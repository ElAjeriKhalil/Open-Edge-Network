
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'config.json');

export function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const cfg = JSON.parse(raw);
  if (process.env.RPC_URL) cfg.rpcUrl = process.env.RPC_URL;
  if (process.env.CLIENT_PRIVATE_KEY) cfg.keys.client = process.env.CLIENT_PRIVATE_KEY;
  if (process.env.WORKER_PRIVATE_KEY) cfg.keys.worker = process.env.WORKER_PRIVATE_KEY;
  return cfg;
}

export function saveConfig(cfg) { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); }
export function providerFrom(cfg) { return new ethers.JsonRpcProvider(cfg.rpcUrl); }
export function walletFrom(cfg, role='client') {
  const pk = role === 'worker' ? cfg.keys.worker : cfg.keys.client;
  if (!pk || !pk.startsWith('0x')) throw new Error(`Missing ${role} private key in config or .env`);
  return new ethers.Wallet(pk, providerFrom(cfg));
}
export function fmt(x) { try { return ethers.formatEther(x); } catch { return String(x); } }
export function parseEdge(x) { return ethers.parseUnits(String(x), 18); }
export function currentWallet(cfg) {
  if (!cfg.keys?.current) throw new Error('not connected (run: oen login --key 0x...)');
  return new ethers.Wallet(cfg.keys.current, providerFrom(cfg));
}