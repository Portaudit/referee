# REFEREE

An independent settlement authority for Solana DvP trades. Work in progress.

Independent project built on Solana DvP. Not affiliated with or endorsed by the Solana Foundation or J.P. Morgan.

## Status

Early. So far only the control paths have been exercised on devnet, using the unmodified DvP program: create, fund, settle with a keypair authority, and reject. Whether a program-derived address can act as the settlement authority is still being tested. Nothing here is audited. Do not use it with real funds.

## What is here

- `dvp/`: generated TypeScript client for the Solana Foundation's DvP program, copied under the MIT licence (see `dvp/LICENSE`).
- `scripts/`: devnet test scripts.

## Licence

This project's own code is licensed under Apache-2.0 (see `LICENSE` and `NOTICE`). The code in `dvp/` is MIT-licensed.
