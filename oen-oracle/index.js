import express from "express";
import { ethers } from "ethers";

const app = express();
app.use(express.json());

// ======= CONFIG =======
const ORACLE_PK = process.env.ORACLE_PK || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // ⚠️ remplace
const STAKING_MANAGER = process.env.STAKING_MANAGER || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";        // adresse déployée
const CHAIN_ID = Number(process.env.CHAIN_ID || 31337);
const PORT = Number(process.env.PORT || 8787);

const signer = new ethers.Wallet(ORACLE_PK);

// simple scoring (à raffiner)
function computeScore(bench) {
  // attend { fp16_tflops, fp32_tflops, mem_gbps }
  const f16 = Number(bench.fp16_tflops || 0);
  const f32 = Number(bench.fp32_tflops || 0);
  const mem = Number(bench.mem_gbps || 0);
  let score =
      700 * (f16 / 10) +
      250 * (f32 / 5)  +
       50 * (mem / 500);
  score = Math.max(100, Math.min(Math.round(score), 100000));
  return score;
}

app.post("/score", async (req, res) => {
  try {
    const { hw, bench, gpuHash, worker, nonce, chainId, verifyingContract } = req.body;
    if (!gpuHash || !worker || !bench) return res.status(400).json({ error: "bad payload" });
    if (nonce === undefined) return res.status(400).json({ error: "missing nonce" });

    const benchScore = computeScore(bench);
    const expiresAt = Math.floor(Date.now()/1000) + 3600; // 1h

    // On signe ce qui sera vérifié on-chain (même schéma que le contrat)
    const digest = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32","uint256","address","address","bytes32","uint256","uint64","uint256"],
      [ethers.id("OEN_NODEMETA_V1"),
       BigInt(chainId ?? CHAIN_ID),
       verifyingContract ?? STAKING_MANAGER,
       worker,
       gpuHash,
       BigInt(benchScore),
       BigInt(expiresAt),
       BigInt(nonce)]
    ));
    const signature = await signer.signMessage(ethers.getBytes(digest));

    return res.json({ benchScore, expiresAt, nonce, signature });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => console.log(`oracle on http://127.0.0.1:${PORT}`));
