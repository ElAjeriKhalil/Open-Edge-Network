import { BrowserProvider } from 'ethers';
import { stakingManager } from '../lib/contracts';
import { useEffect, useState } from 'react';


export function useAutoRegister(opts: {
  provider: BrowserProvider;
  user: string;
  benchJson: any;
  stakingAddress: string;
  agentUrl: string;
}) {
  const { provider, user, benchJson, stakingAddress, agentUrl } = opts;
  const [status, setStatus] = useState<'idle' | 'signing' | 'registering' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
        try {
        if (!provider || !user || !benchJson || !stakingAddress || !agentUrl) return;

        const staking = stakingManager(stakingAddress, provider);

        const current = await staking.metaNonces(user);
        const next = current + 1n;

        setStatus('signing');
        const payload = {
            hw: benchJson.hw,
            bench: benchJson.bench,
            gpuHash: benchJson.gpuHash,
            worker: user,
            nonce: next.toString(),
            chainId: Number((await provider.getNetwork()).chainId),
            verifyingContract: stakingAddress,
        };

        const resp = await fetch(`${agentUrl}/oracle-sign`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!resp.ok) throw new Error(await resp.text());
        const { benchScore, expiresAt, signature } = await resp.json();

        setStatus('registering');
        const tx = await staking.registerNodeSigned(
            user,
            benchJson.gpuHash,
            BigInt(benchScore),
            BigInt(expiresAt),
            next,
            signature
        );
        await tx.wait();

        setStatus('done');
        } catch (e: any) {
        console.error(e);
        setError(e?.message ?? String(e));
        setStatus('error');
        }
    })();
    }, [provider, user, benchJson, stakingAddress, agentUrl]);


  return { status, error };
}
