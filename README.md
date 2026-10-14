# REFEREE

An independent settlement authority for Solana DvP trades. Work in progress.

Independent project built on Solana DvP. Not affiliated with or endorsed by the Solana Foundation or J.P. Morgan.

## Status

Early work in progress. Nothing here is audited. Do not use it with real funds.

What has been verified on Solana devnet, against the Solana Foundation's DvP program as deployed there (`dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq`, last deployed in slot 479376863 at the time of testing):

1. A normal trade with a keypair settlement authority: create, fund, settle. Also a funded trade rejected by a party, with both refunds landing.
2. DvP's create instruction accepts a program-derived address (PDA) as the settlement authority.
3. That PDA, signing through `invoke_signed` from a small stub program (`EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe`), settled a funded trade. The PDA (seeds `["authority"]` under the stub's program ID) is `GE7FbxTFG1ExcvCCuqScLxto65uw5rHqQFpwrH3cDyew`. One test trade, classic SPL tokens only. Transaction `2KZbaS3xcQ7AygZVYNzJYfYWfd8R6PJeZjn2b2xTNib8mRHmY5KNJ3LktJAaJYQn6zosZZNxsqxovT8vNNcTfYoK` (check it with `solana confirm -v <signature> --url devnet`).

4. The current program, upgraded in place at the same address (source in `program/`), adds a trade registry and demo credentials: both parties co-sign the exact terms of a trade, a demo issuer attests that each party may settle, and `settle` refuses trades that are not registered and parties without a valid credential. On devnet, settling an unregistered trade failed on chain with `AccountNotInitialized` (a failed transaction, `5o35xSWPBD3UwbqPR3Mv9DzB6UwzKDgFbPMUeaCEr93WG3r5hpjges2QxnbeEQys2j35xmCbdDtB4qZqWfvir6Nt`), and registered, credentialed trades settled (`5MUcDHFsGo5kb46NHjixqJ4PX9wbGFAi4ib2LoFc7Wc1RD28QAfVtHw28AVQUzacPqo8GQ7ief65Wry7Q2fEEHLe`).
5. In the latest run (`3oShWDTisvoxHp5r72E61xVzDRJb6zdNctRoyXWJpMHg5MxRLYJHHpJBp2KEWAAnGco2e9qgHEie5sKHf3kCmCaD`), `settle` also returned the rent that DvP sweeps to its authority (5,953,760 lamports) and the trade-registration rent to the address both parties signed, so the referee kept nothing from that trade. The trade creator still pays the DvP nonce account rent and transaction fees. The authority PDA still holds about 0.0119 SOL swept by earlier test trades, before this return was added.

Limits: the demo issuer is a keypair controlled by the project author, so credentials are a demonstration and not KYC. Classic SPL tokens only. Unaudited. There is no cancel instruction: a trade that will not settle is unwound by a party through DvP's own Reject or Reclaim, and the registration account of an unwound trade is not closed by this version. DvP's upgrade authority is a trust assumption, and the devnet deployment can differ from DvP's current source. Not built or not tested yet: Token-2022 legs, events and mainnet.

## What is here

- `dvp/`: generated TypeScript client for the Solana Foundation's DvP program, copied under the MIT licence (see `dvp/LICENSE`).
- `program/`: Anchor source of the deployed program (see `program/README.md`).
- `scripts/`: devnet test scripts: `control.ts` (create, fund, settle and reject with a keypair or PDA authority), `pda.ts` (derives the authority PDA) and `settle-stub.ts` (the Test B client for the earlier stub, which is no longer deployed) and `referee.ts` (client for the current program). They need sandbox keypairs that are not in this repository.

## Licence

This project's own code is licensed under Apache-2.0 (see `LICENSE` and `NOTICE`). The code in `dvp/` is MIT-licensed.
