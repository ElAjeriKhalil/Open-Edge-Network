import { useEffect, useMemo, useState } from 'react';
import { id as keccakId } from 'ethers';
import { CONFIG } from './config';
import {
  wallet, getPrivateKey, setPrivateKey, clearPrivateKey,
  edgeToken, jobRegistry, staking,
  fmt, parseEdge, faucetToCurrent
} from './lib/eth';
import './index.css';

const json = (v: any) =>
  JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val), 2);

export default function App() {
  const [pk, setPk] = useState<string>(getPrivateKey() ?? '');
  const [address, setAddress] = useState('');
  const [balClient, setBalClient] = useState('0');
  const [balWorker, setBalWorker] = useState('0');

  // stake form
  const [stakeAmt, setStakeAmt] = useState('1500');
  const [gpuHash, setGpuHash]   = useState('0x' + '11'.repeat(32));
  const [bench, setBench]       = useState('1000');

  // job form
  const [modelCid, setModelCid] = useState('cid:model');
  const [dataCid, setDataCid]   = useState('cid:data');
  const [work, setWork]         = useState('1200');
  const [task, setTask]         = useState('0x' + 'aa'.repeat(32));
  const [bounty, setBounty]     = useState('500');

  // actions
  const [jobId, setJobId]       = useState('1');
  const [jobInfo, setJobInfo]   = useState<any>(null);
  const [proofOut, setProofOut] = useState('0x' + 'bb'.repeat(32));

  // keep a quick reference to wallet (null if not set)
  const w = useMemo(() => {
    try { return wallet(); } catch { return null; }
  }, [pk]);

  useEffect(() => { setAddress(w?.address ?? ''); }, [w]);

  async function refreshBalances() {
    if (!w) return;
    const t = edgeToken();             // read via wallet() provider
    const [bc, bw] = await Promise.all([
      t.balanceOf(w.address),
      t.balanceOf(w.address)
    ]);
    setBalClient(fmt(bc));
    setBalWorker(fmt(bw));
  }
  useEffect(() => { if (w) refreshBalances(); }, [w]);

  function onConnect() {
    setPrivateKey(pk.trim());
    window.location.reload();
  }
  function onDisconnect() {
    clearPrivateKey();
    window.location.reload();
  }

  // DEV: admin faucet
  async function onBuy() {
    await faucetToCurrent('1000'); // send 1000 EDGE to current
    await refreshBalances();
    alert('EDGE received (dev faucet)');
  }

  // STAKE
  async function doStake() {
    if (!w) throw new Error('connect first');
    const t = edgeToken(w);
    const s = staking(w);
    const amt = parseEdge(stakeAmt);

    const pending = await w.provider!.getTransactionCount(w.address, 'pending');
    const n = BigInt(pending);

    const tx1 = await t.approve(CONFIG.contracts.StakingManager, amt, { nonce: n });
    await tx1.wait();

    const tx2 = await s.stake(amt, gpuHash, BigInt(bench), { nonce: n + 1n });
    await tx2.wait();
    await refreshBalances();
    alert('Staked OK');
  }

  // SUBMIT JOB
  async function doSubmitJob() {
    if (!w) throw new Error('connect first');
    const t = edgeToken(w);
    const jr = jobRegistry(w);
    const bountyWei = parseEdge(bounty);

    // task: accept bytes32 or any string
    const taskDigest =
      task.startsWith('0x') && task.length === 66 ? task : keccakId(task);

    const pending = await w.provider!.getTransactionCount(w.address, 'pending');
    const n = BigInt(pending);

    const tx1 = await t.approve(CONFIG.contracts.JobRegistry, bountyWei, { nonce: n });
    await tx1.wait();

    const tx2 = await jr.submitJob(
      modelCid,
      dataCid,
      Number(work),
      taskDigest,
      bountyWei,
      { nonce: n + 1n }                  // <- bigint math
    );
    await tx2.wait();
    alert('Job submitted');
  }

  // CLAIM / RUN / PROOF / GET
  async function doClaim() {
    if (!w) throw new Error('connect first');
    const jr = jobRegistry(w);
    await (await jr.claimJob(BigInt(jobId))).wait();
    alert('Claimed');
  }
  async function doRun() {
    if (!w) throw new Error('connect first');
    const jr = jobRegistry(w);
    await (await jr.markRunning(BigInt(jobId))).wait();
    alert('Running marked');
  }
  async function doProof() {
    if (!w) throw new Error('connect first');
    const jr = jobRegistry(w);
    await (await jr.submitProof(BigInt(jobId), '0x', proofOut)).wait();
    alert('Proof submitted');
  }
  async function doGetJob() {
    const jr = jobRegistry();
    const j = await jr.getJob(BigInt(jobId));
    setJobInfo(j);
  }

  return (
    <div className="container">
      <h1>OEN — Test UI</h1>

      <section>
        <h2>RPC / Contracts</h2>
        <div className="grid">
          <div><b>RPC</b><div>{CONFIG.rpcUrl}</div></div>
          <div><b>EdgeToken</b><div>{CONFIG.contracts.EdgeToken}</div></div>
          <div><b>StakingManager</b><div>{CONFIG.contracts.StakingManager}</div></div>
          <div><b>JobRegistry</b><div>{CONFIG.contracts.JobRegistry}</div></div>
        </div>
      </section>

      <section>
        <h2>Connexion (clé privée DEV)</h2>
        <input value={pk} onChange={e => setPk(e.target.value)} placeholder="0x…64 hex" />
        <div className="row">
          <button onClick={onConnect}>Connect</button>
          <button onClick={onDisconnect} className="secondary">Disconnect</button>
          <button onClick={onBuy} className="secondary">Buy EDGE (dev)</button>
        </div>
        <div className="row">
          <div>Address: {address || '—'}</div>
          <button onClick={refreshBalances}>Refresh balances</button>
        </div>
        <div className="grid">
          <div><b>Client EDGE</b><div>{balClient}</div></div>
          <div><b>Worker EDGE</b><div>{balWorker}</div></div>
        </div>
      </section>

      <section>
        <h2>Stake</h2>
        <div className="grid">
          <label>Amount EDGE <input value={stakeAmt} onChange={e=>setStakeAmt(e.target.value)} /></label>
          <label>gpuHash <input value={gpuHash} onChange={e=>setGpuHash(e.target.value)} /></label>
          <label>bench <input value={bench} onChange={e=>setBench(e.target.value)} /></label>
        </div>
        <button onClick={doStake}>Stake</button>
      </section>

      <section>
        <h2>Submit Job</h2>
        <div className="grid">
          <label>modelCid <input value={modelCid} onChange={e=>setModelCid(e.target.value)} /></label>
          <label>dataCid  <input value={dataCid} onChange={e=>setDataCid(e.target.value)} /></label>
          <label>workUnits <input value={work} onChange={e=>setWork(e.target.value)} /></label>
          <label>task (bytes32 or any string) <input value={task} onChange={e=>setTask(e.target.value)} /></label>
          <label>bounty EDGE <input value={bounty} onChange={e=>setBounty(e.target.value)} /></label>
        </div>
        <button onClick={doSubmitJob}>Submit</button>
      </section>

      <section>
        <h2>Job actions</h2>
        <div className="grid">
          <label>jobId <input value={jobId} onChange={e=>setJobId(e.target.value)} /></label>
          <label>proof outputDigest <input value={proofOut} onChange={e=>setProofOut(e.target.value)} /></label>
        </div>
        <div className="row">
          <button onClick={doGetJob}>Get</button>
          <button onClick={doClaim}>Claim</button>
          <button onClick={doRun}>Run</button>
          <button onClick={doProof}>Submit proof</button>
        </div>
        {jobInfo && (
      <pre className="pre">{json(jobInfo)}</pre>
    )}
      </section>
    </div>
  );
}
