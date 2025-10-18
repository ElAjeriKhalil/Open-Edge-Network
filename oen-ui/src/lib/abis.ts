// oen-ui/src/lib/abis.ts
// Always export raw ABI arrays, whatever the JSON shape is (array | {abi:[]} | {default:{abi:[]}})
import stakingJson from '../abi/StakingManager.json';
import jobJson     from '../abi/JobRegistry.json';
import edgeJson    from '../abi/EdgeToken.json';

function abiOf(mod: any): any[] {
  if (Array.isArray(mod)) return mod;
  if (mod?.abi && Array.isArray(mod.abi)) return mod.abi;
  if (mod?.default?.abi && Array.isArray(mod.default.abi)) return mod.default.abi;
  throw new Error('ABI not found or invalid JSON format');
}

export const stakingAbi = abiOf(stakingJson);
export const jobAbi     = abiOf(jobJson);
export const edgeAbi    = abiOf(edgeJson);
