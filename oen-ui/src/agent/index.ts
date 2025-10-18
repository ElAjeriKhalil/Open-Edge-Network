// agent/index.ts
import express from 'express';
import cors from 'cors';
import os from 'os';
import { execFileSync } from 'node:child_process';
import { keccak256, AbiCoder } from 'ethers';

const ORACLE_URL = process.env.ORACLE_URL ?? 'http://127.0.0.1:8787';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Lance le bench local et renvoie { hw, bench, gpuHash }
app.post('/bench', (_req, res) => {
  try {
    let vendor = 'UNKNOWN', name = 'UNKNOWN', driver = 'UNKNOWN', vramBytes = 0;
    try {
      const out = execFileSync(
        'nvidia-smi',
        ['--query-gpu=name,driver_version,memory.total', '--format=csv,noheader,nounits'],
        { encoding: 'utf8' }
      ).trim();
      const [n, d, mem] = out.split(',').map(s => s.trim());
      vendor = 'NVIDIA'; name = n; driver = d; vramBytes = Number(mem) * 1024 * 1024;
    } catch { /* pas grave si pas de nvidia-smi */ }

    const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
    const pyOut = execFileSync(pyCmd, ['tools/bench/run_bench.py'], { encoding: 'utf8' });
    const bench = JSON.parse(pyOut);

    const abi = AbiCoder.defaultAbiCoder();
    const gpuHash = keccak256(
      abi.encode(['string','string','string','string','uint256','string'],
                 ['GPUv1', vendor, name, driver, BigInt(vramBytes), ''])
    );

    res.json({
      hw: {
        gpu: { vendor, name, driver, vramBytes },
        cpu: { model: os.cpus()?.[0]?.model ?? '', cores: os.cpus()?.length ?? 0 },
        os:  { platform: os.platform(), release: os.release() }
      },
      bench,
      gpuHash
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message ?? 'bench failed' });
  }
});

// Proxy vers l’oracle pour obtenir la signature
app.post('/oracle-sign', async (req, res) => {
  try {
    const resp = await fetch(`${ORACLE_URL}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    if (!resp.ok) return res.status(resp.status).send(await resp.text());
    res.json(await resp.json());
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message ?? 'oracle-sign failed' });
  }
});

const PORT = Number(process.env.AGENT_PORT ?? 8788);
app.listen(PORT, () => console.log(`local agent on http://127.0.0.1:${PORT}`));
