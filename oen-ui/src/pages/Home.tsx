import { useEffect, useState } from 'react';
import { BrowserProvider } from 'ethers';
import { useAutoRegister } from '../hooks/useAutoRegister';

export default function Home() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [address, setAddress] = useState<string>('');
  const [bench, setBench] = useState<any | null>(null);

  // 1) connexion wallet + récupération address
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;

    const p = new BrowserProvider(eth);
    setProvider(p);

    (async () => {
      await eth.request({ method: 'eth_requestAccounts' });
      const signer = await p.getSigner();
      setAddress(await signer.getAddress());
    })();
  }, []);

  // 2) récupérer le bench JSON (exposé par ton agent local)
  useEffect(() => {
    (async () => {
      try {
        // adapte l’URL selon ton agent (ex: /agent/bench.json si proxy Vite)
        const r = await fetch('/agent/bench.json');
        if (r.ok) setBench(await r.json());
      } catch { /* ignore pour l’instant */ }
    })();
  }, []);

  // 3) variables d’environnement (vite)
  const STAKING_ADDRESS = import.meta.env.VITE_STAKING_ADDRESS as string;
  const AGENT_URL = (import.meta.env.VITE_AGENT_URL as string) ?? 'http://127.0.0.1:8787';

  // 4) hook d’auto-register (il gère lui-même les cas manquants via early-return)
  useAutoRegister({
    provider: provider as BrowserProvider, // on sait qu’on l’a initialisé plus haut
    user: address,
    benchJson: bench,
    stakingAddress: STAKING_ADDRESS,
    agentUrl: AGENT_URL,
  });

  return <div>hello</div>;
}
