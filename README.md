# REFEREE

An independent settlement authority for Solana DvP trades. Work in progress.

Independent project built on Solana DvP. Not affiliated with or endorsed by the Solana Foundation or J.P. Morgan.

## Status

Early work in progress. Nothing here is audited. Do not use it with real funds.

What has been verified on Solana devnet, against the Solana Foundation's DvP program as deployed there (`dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq`, last deployed in slot 479376863 at the time of testing):

1. A normal trade with a keypair settlement authority: create, fund, settle. Also a funded trade rejected by a party, with both refunds landing.
2. DvP's create instruction accepts a program-derived address (PDA) as the settlement authority.
3. That PDA, signing through `invoke_signed` from a small stub program (`EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe`), settled a funded trade. The PDA (seeds `["authority"]` under the stub's program ID) is `GE7FbxTFG1ExcvCCuqScLxto65uw5rHqQFpwrH3cDyew`. One test trade, classic SPL tokens only. Transaction `2KZbaS3xcQ7AygZVYNzJYfYWfd8R6PJeZjn2b2xTNib8mRHmY5KNJ3LktJAaJYQn6zosZZNxsqxovT8vNNcTfYoK` (check it with `solana confirm -v <signature> --url devnet`).

Not built or not tested yet: the trade registry, credential checks, fees, Token-2022 legs and mainnet. The stub has no checks of its own: it will settle any trade that names its PDA as authority. The stub's source is not in this repository yet. DvP's upgrade authority is a trust assumption, and the devnet deployment can differ from DvP's current source.

## What is here

- `dvp/`: generated TypeScript client for the Solana Foundation's DvP program, copied under the MIT licence (see `dvp/LICENSE`).
- `scripts/`: devnet test scripts: `control.ts` (create, fund, settle and reject with a keypair or PDA authority), `pda.ts` (derives the authority PDA) and `settle-stub.ts` (calls the stub's settle instruction). They need sandbox keypairs that are not in this repository.

## Licence

This project's own code is licensed under Apache-2.0 (see `LICENSE` and `NOTICE`). The code in `dvp/` is MIT-licensed.
