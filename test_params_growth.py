import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# ----------------------
# Parameters (edit freely)
# ----------------------
months = 60  # 5 years
initial_supply = 1_000_000_000
supply_cap = 1_500_000_000
mint_per_node = 200          # EDGE created in rewardPool per new node
burn_per_offline_node = 200  # EDGE burned when a node is inactive >30 days

# On‑boarding & churn scenarios – tweak these!
scenarios = {
    "A_pessimistic": {
        "start_nodes": 100,
        "growth_rate": 0.01,   # +1 % nodes per month
        "offline_rate": 0.05,  # 5 % of nodes go offline each month
    },
    "B_realistic": {
        "start_nodes": 5000,
        "growth_rate": 0.05,   # +7 % nodes
        "offline_rate": 0.05,  # 10 % offline
    },
    "C_aggressive": {
        "start_nodes": 500,
        "growth_rate": 0.10,   # +10 %
        "offline_rate": 0.005, # 0.5 % offline
    },
}

results = {}

for name, cfg in scenarios.items():
    active_nodes = cfg["start_nodes"]
    reward_pool = 0
    supply = initial_supply
    burned_total = 0
    nodes_cumulative = active_nodes

    rows = []

    for m in range(months):
        # new nodes onboarding
        new_nodes = int(active_nodes * cfg["growth_rate"])
        nodes_cumulative += new_nodes
        mint_amount = new_nodes * mint_per_node
        if supply + mint_amount > supply_cap:
            mint_amount = supply_cap - supply  # respect cap
        supply += mint_amount
        reward_pool += mint_amount

        # offline churn & burn
        offline_nodes = int(active_nodes * cfg["offline_rate"])
        burn_amount = offline_nodes * burn_per_offline_node
        burned_total += burn_amount
        supply -= burn_amount
        supply = max(supply, 0)
        active_nodes = active_nodes + new_nodes - offline_nodes

        rows.append({
            "month": m,
            "active_nodes": active_nodes,
            "supply": supply,
            "burned_total": burned_total,
            "reward_pool": reward_pool,
            "nodes_cumulative": nodes_cumulative,
        })

    results[name] = pd.DataFrame(rows)

# ------------- Outputs -------------
summary = []
for name, df in results.items():
    last = df.iloc[-1]
    summary.append({
        "Scenario": name,
        "Active nodes Y5": last["active_nodes"],
        "Cumulative nodes": last["nodes_cumulative"],
        "Supply Y5": last["supply"],
        "Burned EDGE": last["burned_total"],
        "RewardPool": last["reward_pool"],
    })
summary_df = pd.DataFrame(summary)
print("\n=== 5‑year summary ===")
print(summary_df.to_string(index=False))

# Plot supply
plt.figure()
for name, df in results.items():
    plt.plot(df["month"] / 12, df["supply"], label=name)
plt.title("Total EDGE supply over time (NBS)")
plt.xlabel("Years")
plt.ylabel("EDGE supply")
plt.legend()
plt.tight_layout()
plt.show()

# Plot active nodes
plt.figure()
for name, df in results.items():
    plt.plot(df["month"] / 12, df["active_nodes"], label=name)
plt.title("Active nodes over time")
plt.xlabel("Years")
plt.ylabel("Nodes")
plt.legend()
plt.tight_layout()
plt.show()
