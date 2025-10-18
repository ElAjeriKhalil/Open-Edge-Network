# OEN CLI (JavaScript, ethers v6)

## Install
```bash
cd oen-cli
npm install
copy .env.example .env   # fill CLIENT_PRIVATE_KEY, WORKER_PRIVATE_KEY, RPC_URL
```

## Configure
```bash
node bin/oen.js config:set --rpc http://127.0.0.1:8545 --token <EdgeToken> --staking <StakingManager> --jr <JobRegistry> --oracle <MockGreenScoreOracle> --client-key 0x... --worker-key 0x...
```

## Flows
Fund worker and stake:
```bash
node bin/oen.js balances
node bin/oen.js fund:worker 5000
node bin/oen.js worker:stake --amount 1500 --gpu-hash 0x1111...1111 --bench 4242
```

Submit & execute a job:
```bash
node bin/oen.js job:submit --model cid:model --data cid:data --task 0x<64hex> --bounty 500
node bin/oen.js job:claim --id 1
node bin/oen.js job:run --id 1
node bin/oen.js job:proof --id 1 --out 0x<64hex>
node bin/oen.js job:get --id 1
```
