#!/usr/bin/env node
import { Command } from 'commander';
import { ethers } from 'ethers';
import { loadConfig, saveConfig, providerFrom, walletFrom, fmt, parseEdge, currentWallet } from '../lib/helpers.js';
import edgeAbiJson    from '../abi/EdgeToken.json'           with { type: 'json' };
import stakingAbiJson from '../abi/StakingManager.json'       with { type: 'json' };
import jrAbiJson      from '../abi/JobRegistry.json'          with { type: 'json' };
import oracleAbiJson  from '../abi/MockGreenScoreOracle.json' with { type: 'json' };
import fs from 'node:fs';
import os from 'node:os';
import fetch from 'node-fetch';
import { execFileSync } from 'node:child_process';

// ---------- ABI helper (handles array, artifact.abi, default.abi) ----------
function abiOf(mod) {
  if (Array.isArray(mod)) return mod;
  if (mod && Array.isArray(mod.abi)) return mod.abi;
  if (mod && mod.default && Array.isArray(mod.default.abi)) return mod.default.abi;
  throw new Error('ABI not found or invalid JSON format');
}
const edgeAbi    = abiOf(edgeAbiJson);     // ✅ always the ABI array
const stakingAbi = abiOf(stakingAbiJson);  // ✅
const jrAbi      = abiOf(jrAbiJson);       // ✅
const oracleAbi  = abiOf(oracleAbiJson);   // (not used everywhere, but ready)

const program = new Command();
program.name('oen').description('OEN CLI').version('0.1.0');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
program.command('config:set')
  .description('Set RPC URL, contract addresses, or keys')
  .option('--rpc <url>')
  .option('--token <addr>')
  .option('--staking <addr>')
  .option('--jr <addr>')
  .option('--oracle <addr>')
  .option('--client-key <hex>')
  .option('--worker-key <hex>')
  .action((opts) => {
    const cfg = loadConfig();
    if (opts.rpc)     cfg.rpcUrl = opts.rpc;
    if (opts.token)   cfg.contracts.EdgeToken = opts.token;
    if (opts.staking) cfg.contracts.StakingManager = opts.staking;
    if (opts.jr)      cfg.contracts.JobRegistry = opts.jr;
    if (opts.oracle)  cfg.contracts.MockGreenScoreOracle = opts.oracle;
    if (opts.clientKey) cfg.keys.client = opts.clientKey;
    if (opts.workerKey) cfg.keys.worker = opts.workerKey;
    saveConfig(cfg);
    console.log('✅ Config updated');
  });

// ─────────────────────────────────────────────────────────────────────────────
// BALANCES
// ─────────────────────────────────────────────────────────────────────────────
program.command('balances').description('Show EDGE balances').action(async () => {
  const cfg = loadConfig();
  const provider = providerFrom(cfg);
  const token = new ethers.Contract(cfg.contracts.EdgeToken, edgeAbi, provider);
  const client = walletFrom(cfg, 'client').address;
  const worker = walletFrom(cfg, 'worker').address;
  const bc = await token.balanceOf(client);
  const bw = await token.balanceOf(worker);
  console.log('Client', client, fmt(bc), 'EDGE');
  console.log('Worker', worker, fmt(bw), 'EDGE');
});

program.command('fund:worker').argument('<amountEDGE>').action(async (amt) => {
  const cfg = loadConfig();
  const wClient = walletFrom(cfg, 'client');
  const token = new ethers.Contract(cfg.contracts.EdgeToken, edgeAbi, wClient);
  const tx = await token.transfer(walletFrom(cfg, 'worker').address, parseEdge(amt));
  await tx.wait();
  console.log('✅ Transferred', amt, 'EDGE to worker');
});

// ─────────────────────────────────────────────────────────────────────────────
// STAKING
// ─────────────────────────────────────────────────────────────────────────────
program.command('worker:stake')
  .requiredOption('--amount <EDGE>')
  .option('--gpu-hash <hex>', '0x' + '11'.repeat(32))
  .option('--bench <int>', '1000')
  .action(async (opts) => {
    const cfg = loadConfig();
    const wWorker  = currentWallet(cfg)
    const provider = wWorker.provider;
    const token    = new ethers.Contract(cfg.contracts.EdgeToken,       edgeAbi,    wWorker);
    const staking  = new ethers.Contract(cfg.contracts.StakingManager,  stakingAbi, wWorker);

    const amt = parseEdge(opts.amount);

    // nonce -> BigInt
    const pending = await provider.getTransactionCount(wWorker.address, 'pending');
    const n = BigInt(pending);

    // approve (nonce n)
    const tx1 = await token.approve(cfg.contracts.StakingManager, amt, { nonce: n });
    await tx1.wait();

    // stake (nonce n+1)
    const tx2 = await staking.stake(amt, opts.gpuHash, BigInt(opts.bench), { nonce: n + 1n });
    await tx2.wait();

    console.log('✅ Staked', opts.amount, 'EDGE');
  });

program.command('worker:unstake')
  .requiredOption('--amount <EDGE>')
  .action(async (opts) => {
    const cfg = loadConfig();
    const wWorker = currentWallet(cfg)
    const staking = new ethers.Contract(cfg.contracts.StakingManager, stakingAbi, wWorker);
    await (await staking.unstake(parseEdge(opts.amount))).wait();
    console.log('✅ Unstaked', opts.amount, 'EDGE');
  });

// ─────────────────────────────────────────────────────────────────────────────
// JOBS
// ─────────────────────────────────────────────────────────────────────────────
program.command('job:submit')
  .requiredOption('--model <cid>')
  .requiredOption('--data <cid>')
  .requiredOption('--work <units>')
  .requiredOption('--task <hex>')      // bytes32 (0x… 64 hex)
  .requiredOption('--bounty <EDGE>')
  .action(async (opts) => {
    const cfg = loadConfig();
    const wClient = currentWallet(cfg);
    const provider = wClient.provider;

    const token = new ethers.Contract(cfg.contracts.EdgeToken, edgeAbi, wClient);
    const jr    = new ethers.Contract(cfg.contracts.JobRegistry, jrAbi, wClient);

    const bounty    = parseEdge(opts.bounty);
    const workUnits = Number(opts.work);

    if (!Number.isInteger(workUnits) || workUnits < 1) {
      throw new Error('work units invalides (entier >= 1)');
    }
    let taskDigest = opts.task;

    if (typeof taskDigest !== 'string' || !taskDigest.startsWith('0x') || opts.task.length !== 66) {
      taskDigest = ethers.id(String(opts.task));
    }

    const n = BigInt(await provider.getTransactionCount(wClient.address, 'pending'));

    const tx1 = await token.approve(cfg.contracts.JobRegistry, bounty, { nonce: n });
    await tx1.wait();

    // submitJob(string model, string data, uint32 workUnits, bytes32 taskDigest, uint256 bounty)
    const tx2 = await jr.submitJob(opts.model, opts.data, workUnits, taskDigest, bounty, { nonce: n + 1n });
    const rc  = await tx2.wait();

    console.log('✅ Job submitted. Tx:', rc.hash);
  });

program.command('job:claim')
  .requiredOption('--id <jobId>')
  .action(async (opts) => {
    const cfg = loadConfig();
    const wWorker = currentWallet(cfg);
    const jr = new ethers.Contract(cfg.contracts.JobRegistry, jrAbi, wWorker);
    await (await jr.claimJob(BigInt(opts.id))).wait();
    console.log('✅ Job claimed');
  });

program.command('job:run')
  .requiredOption('--id <jobId>')
  .action(async (opts) => {
    const cfg = loadConfig();
    const wWorker = currentWallet(cfg);
    const jr = new ethers.Contract(cfg.contracts.JobRegistry, jrAbi, wWorker);
    await (await jr.markRunning(BigInt(opts.id))).wait();
    console.log('✅ Job marked running');
  });

program.command('job:proof')
  .requiredOption('--id <jobId>')
  .requiredOption('--out <hex>')
  .action(async (opts) => {
    const cfg = loadConfig();
    const wWorker = currentWallet(cfg);
    const jr = new ethers.Contract(cfg.contracts.JobRegistry, jrAbi, wWorker);
    // submitProof(uint256 jobId, bytes proof, bytes32 outputDigest)
    await (await jr.submitProof(BigInt(opts.id), '0x', opts.out)).wait();
    console.log('✅ Proof submitted');
  });

program.command('job:timeout')
  .requiredOption('--id <jobId>')
  .action(async (opts) => {
    const cfg = loadConfig();
    const wAny = walletFrom(cfg, 'client');            // anyone allowed if your contract permits
    const jr = new ethers.Contract(cfg.contracts.JobRegistry, jrAbi, wAny);
    await (await jr.timeoutJob(BigInt(opts.id))).wait(); // ensure the function is named timeoutJob on-chain
    console.log('✅ Timeout executed');
  });

program.command('job:get')
  .requiredOption('--id <jobId>')
  .action(async (opts) => {
    const cfg = loadConfig();
    const provider = providerFrom(cfg);
    const jr = new ethers.Contract(cfg.contracts.JobRegistry, jrAbi, provider);
    console.log(await jr.getJob(BigInt(opts.id)));
  });

program.command('login')
  .requiredOption('--key <hex>', 'private key 0x...')
  .action((opts) => {
    const cfg = loadConfig();
    if (!opts.key.startsWith('0x') || opts.key.length !== 66) {
      throw new Error('clé privée invalide (0x + 64 hex)');
    }
    cfg.keys.current = opts.key;              // on garde une “session”
    saveConfig(cfg);
    console.log('✅ connected as', new ethers.Wallet(opts.key).address);
  });

program.command('logout').action(() => {
  const cfg = loadConfig();
  delete cfg.keys.current;
  saveConfig(cfg);
  console.log('✅ logged out');
});

program.command('whoami').action(() => {
  const cfg = loadConfig();
  if (!cfg.keys.current) return console.log('not connected');
  console.log('address:', new ethers.Wallet(cfg.keys.current).address);
});


program.command('buy')
  .requiredOption('--amount <EDGE>')
  .action(async (opts) => {
    const cfg = loadConfig();
    if (!cfg.keys?.admin) {
      throw new Error('admin key absent. Ajoute-la: oen admin:set --key 0x...');
    }
    const wAdmin = new ethers.Wallet(cfg.keys.admin, providerFrom(cfg));
    const token = new ethers.Contract(cfg.contracts.EdgeToken, edgeAbi, wAdmin);

    const to = currentWallet(cfg).address;
    const amt = parseEdge(opts.amount);
    const tx = await token.transfer(to, amt);
    await tx.wait();
    console.log(`✅ sent ${opts.amount} EDGE to ${to}`);
  });

program.command('admin:set')
  .requiredOption('--key <hex>')
  .action((opts) => {
    const cfg = loadConfig();
    cfg.keys = cfg.keys || {};
    cfg.keys.admin = opts.key;
    saveConfig(cfg);
    console.log('✅ admin key saved (dev only)');
  });


program.command('jobs:scan')
  .option('--min-bounty <EDGE>', '0 by default', '0')
  .action(async (opts) => {
    const cfg = loadConfig();
    const w = currentWallet(cfg);
    const provider = w.provider;
    const jr = new ethers.Contract(cfg.contracts.JobRegistry, jrAbi, provider);
    const staking = new ethers.Contract(cfg.contracts.StakingManager, stakingAbi, provider);

    const minBountyWei = parseEdge(opts.minBounty);
    const next = await jr.nextJobId();

    // simple scan des 100 derniers
    for (let id = next - 1n; id >= 1n && id > next - 100n; id--) {
      const j = await jr.getJob(id);
      const status = Number(j[8] ?? j.status ?? 0); // suivant ton ABI
      if (status !== 0 /*Submitted*/) continue;
      if (j.bounty < minBountyWei) continue;

      const st = await staking.stakeOf(w.address);
      if (st === 0n) { console.log('⛔ no stake, skip'); break; }

      // option: benchScore min
      // const [gh, score] = await staking.getNodeMeta(w.address);
      // if (score < requiredScoreFromWorkUnits(Number(j.workUnits))) continue;

      console.log('✅ eligible job', id.toString(), 'bounty', fmt(j.bounty));
      return; // affiche juste un job éligible
    }
    console.log('no eligible job found');
  });


  program.command('jobs:claim-if-eligible')
  .requiredOption('--id <jobId>')
  .action(async (opts) => {
    const cfg = loadConfig();
    const w = currentWallet(cfg);
    const jr = new ethers.Contract(cfg.contracts.JobRegistry, jrAbi, w);
    const staking = new ethers.Contract(cfg.contracts.StakingManager, stakingAbi, w);

    const st = await staking.stakeOf(w.address);
    if (st === 0n) throw new Error('no stake');

    const j = await jr.getJob(BigInt(opts.id));
    const status = Number(j[8] ?? j.status ?? 0);
    if (status !== 0) throw new Error('job not submitted');

    await (await jr.claimJob(BigInt(opts.id))).wait();
    console.log('✅ claimed', opts.id);
  });

// ─────────────────────────────────────────────────────────────────────────────
// BENCHMARK + NODE META (oracle signature)
// ─────────────────────────────────────────────────────────────────────────────
program.command('worker:bench')
  .description('Bench local rapide et calcul du gpuHash')
  .option('--out <file>', 'chemin de sortie JSON', 'bench_report.json')
  .action(async (opts) => {
    let vendor = 'UNKNOWN', name = 'UNKNOWN', driver = 'UNKNOWN', vramBytes = 0;
    try {
      const out = execFileSync(
        'nvidia-smi',
        ['--query-gpu=name,driver_version,memory.total', '--format=csv,noheader,nounits'],
        { encoding: 'utf8' }
      ).trim();
      const [n, d, mem] = out.split(',').map(s => s.trim());
      vendor = 'NVIDIA'; name = n; driver = d; vramBytes = Number(mem) * 1024 * 1024;
    } catch (_) { /* nvidia-smi absent -> still fine */ }

    const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
    const pyOut = execFileSync(pyCmd, ['tools/bench/run_bench.py'], { encoding: 'utf8' });
    const bench = JSON.parse(pyOut);

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const gpuHash = ethers.keccak256(
      abi.encode(['string','string','string','string','uint256','string'],
                 ['GPUv1', vendor, name, driver, BigInt(vramBytes), ''])
    );

    const report = {
      hw: {
        gpu: { vendor, name, driver, vramBytes },
        cpu: { model: os.cpus()?.[0]?.model ?? '', cores: os.cpus()?.length ?? 0 },
        os:  { platform: os.platform(), release: os.release() }
      },
      bench,
      gpuHash
    };

    fs.writeFileSync(opts.out, JSON.stringify(report, null, 2));
    console.log('✅ bench ok, gpuHash =', gpuHash, '→', opts.out);
  });

program.command('worker:info')
  .description('Affiche gpuHash/benchScore enregistrés on-chain')
  .action(async () => {
    const cfg = loadConfig();
    const provider = providerFrom(cfg);
    const w = walletFrom(cfg, 'worker');
    const staking = new ethers.Contract(cfg.contracts.StakingManager, stakingAbi, provider);
    const [gh, score, created] = await staking.getNodeMeta(w.address);
    console.log('worker:',   w.address);
    console.log('gpuHash:',  gh);
    console.log('benchScore:', score.toString());
    console.log('createdAt:', Number(created));
  });

program.command('worker:register')
  .description('Enregistre le meta (gpuHash/benchScore) via signature oracle')
  .requiredOption('--report <file>', 'bench_report.json')
  .requiredOption('--oracle-url <url>', 'http://127.0.0.1:8787')
  .action(async (opts) => {
    const cfg = loadConfig();
    const provider = providerFrom(cfg);
    const w = walletFrom(cfg, 'worker');
    const staking = new ethers.Contract(cfg.contracts.StakingManager, stakingAbi, provider);

    const report = JSON.parse(fs.readFileSync(opts.report, 'utf8'));

    const current = await staking.metaNonces(w.address);  // v6 -> bigint
    const next = current + 1n;

    const payload = {
      hw: report.hw,
      bench: report.bench,
      gpuHash: report.gpuHash,
      worker: w.address,
      nonce: next.toString(),
      chainId: Number((await provider.getNetwork()).chainId),
      verifyingContract: cfg.contracts.StakingManager
    };

    const res = await fetch(opts.oracleUrl + '/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error('oracle err', res.status, await res.text());
      process.exit(1);
    }
    const { benchScore, expiresAt, nonce, signature } = await res.json();

    if (BigInt(nonce) !== next) {
      throw new Error(`nonce mismatch oracle=${nonce} expected=${next}`);
    }

    const stakingWithWallet = new ethers.Contract(cfg.contracts.StakingManager, stakingAbi, w);
    const tx = await stakingWithWallet.registerNodeSigned(
      w.address,
      report.gpuHash,
      BigInt(benchScore),
      Number(expiresAt),
      next,
      signature
    );
    await tx.wait();
    console.log('✅ Node meta enregistré:', { benchScore, expiresAt, nonce: next.toString() });
  });

// ─────────────────────────────────────────────────────────────────────────────
program.parseAsync(process.argv);
