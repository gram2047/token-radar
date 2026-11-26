# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/gram2047/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/gram2047/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols, finds the ones that record no token and are not a wrapped or staked product of one that trades, and ranks them by what their launch would be worth if their record stayed as it is.

The value model is calibrated from the snapshot itself. Each category is priced at the median market-cap / TVL of that category's own live-token protocols, shrunk toward the global median in log space by peer count (weight n / (n + 6), clamped to [0.02x, 3x]), then adjusted by 7-day TVL growth and by how long the protocol has run with no token. No protocol name is special-cased: the same function scores every row. The board covers all 40 watchlist protocols and adds 138 early finds below the $50M floor, each with a concrete farm plan that names its cost and its time.

The dashboard is a static page that renders with no network: the ranked board, a detail view for every protocol (which recomputes its implied value from the row's own figures, as a visible check), watchlist / early / live-token views, and filters by category and search.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

Node.js 22.18 or later, standard library only. `/input/snapshot.json` is the sealed snapshot the grader mounts; outside the grader, pass any copy of the kit's `input/snapshot.json` with `--input`. The program writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=bwt4x0wk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
