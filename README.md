# REFEREE

[![Verified on devnet](https://img.shields.io/badge/Verified-on%20devnet-success)](docs/RECEIPTS.md)

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
6. The latest version adds events (`TradeRegistered`, `TradeSettled`, `TradeClosed`, `CredentialSet`) and a `close_trade` instruction. Closing a registration while its DvP trade is still open fails on chain with `TradeStillOpen` (a failed transaction, `2zePt15vxgicy8T6SCJsHTKwJD851ZAUDbxG4fz7c5nHZnUzABB871jhVucaiydTs7vRqbH8cmx3FtDkx8MmERPa`); after the trade was rejected through DvP, `close_trade` returned the registration rent (`3Nh5MzuAK9TghTSnSJFYs5MXaeHXcUqtuwvES67GMDMKWc56oB8Uhp2xxBXEmUFwvEmSREZtVgWDvixNeHzhNZ3s`).
7. From the fourth in-place upgrade on, the program accepts Token-2022 legs for plain mints. DvP alone settled a plain Token-2022 trade first, and then a Referee-gated Token-2022 trade was registered and settled on devnet with the rent returned to the chosen address. The signatures are in the "Token-2022 legs" section of `docs/RECEIPTS.md`. Mint extensions such as transfer hooks and fees are not checked and not tested.
8. A minimal Verifex program (`4GTqnRnN4ZDTzHf2EeqQW98RhDAtCkwG7vTgaPapR4Qs`) checks one thing, that a presented agent program has no upgrade authority, and then issues the credential by calling Referee as its issuer PDA. Referee's admin switched the issuer to that PDA with a new admin-only `set_issuer` (fifth in-place upgrade). It demonstrates the issuer path: it does not bind the presented program to the subject, and the two agent programs in the receipts are stand-ins (the classic Token program, which has no upgrade authority on devnet, and Token-2022, which does). See `docs/RECEIPTS.md`.
9. A second Verifex instruction, `verify_outcome_and_issue` ("Verifex Core"), issues a credential only if a commitment on a devnet-only copy of the author's separate TrustRail project ("TrustRail Core", `58t4gi88MNSURkwN6GuGugmXWPFqAT6s9pB56Srx4Bez`) is `Passed` and its executor is the subject. A wrong subject was refused on chain (error 6005); the executor got a credential and its trade settled through Referee. TrustRail's `Passed` is a weak gate (it compares an output balance with a minimum, and a donation could satisfy it), the swap behind it is a 1:1 stand-in, and the author ran every program involved. The patch that makes the copy is in `trustrail_core/`; TrustRail itself is unchanged. See `docs/RECEIPTS.md`.
10. On 18 October 2026 I found and fixed four issues in my own code review of Referee: an accepted all-zero settlement destination, an accepted zero refund address, no minimum settle window, and credentials that could not be renewed after an issuer change. Each fix was tested on devnet. The evidence, and the limits I did not fix, are in `docs/FIXES-18-OCT.md`.

Limits: the demo issuer is a keypair controlled by the project author, so credentials are a demonstration and not KYC. Classic SPL and plain Token-2022 legs only (Token-2022 mint extensions such as transfer hooks and fees are not checked). Unaudited. The REFEREE program itself is upgradeable by the project author's wallet (it has been upgraded in place seven times, the last two on 18 October 2026 to fix issues I found in my own review), which is a trust assumption. Mints with a freeze authority can block a trade from settling or unwinding, and the program does not check for that yet. There is no cancel instruction: a trade that will not settle is unwound by a party through DvP's own Reject or Reclaim, after which anyone can close its registration with `close_trade`. DvP's upgrade authority is a trust assumption, and the devnet deployment can differ from DvP's current source. Not built or not tested yet: Token-2022 mints with extensions, and mainnet. Since the fifth upgrade the configured issuer is the Verifex program's PDA; credentials from earlier scenes were issued by the demo key. Verifex's second instruction trusts TrustRail Core's `Passed` status, which is a weak gate.

## What is here

- `dvp/`: generated TypeScript client for the Solana Foundation's DvP program, copied under the MIT licence (see `dvp/LICENSE`).
- `program/`: Anchor source of the deployed program (see `program/README.md`).
- `scripts/`: devnet test scripts: `control.ts` (create, fund, settle and reject with a keypair or PDA authority), `pda.ts` (derives the authority PDA) and `settle-stub.ts` (the Test B client for the earlier stub, which is no longer deployed), `referee.ts` (client for the current program) and `control22.ts` and `referee22.ts` (the same two for Token-2022 mints; they read a separate `state22.env`). `verifex.ts`, `control-vx.ts` and `referee-vx.ts` drive the Verifex scenes and read a separate `state-vx.env`. They need sandbox keypairs that are not in this repository. `verifex-core.ts`, `control-core.ts` and `referee-core.ts` are copies for the TrustRail Core scene; they read `state-core.env` and a key file `coreexec.json` that are not in this repository.

## Licence

This project's own code is licensed under Apache-2.0 (see `LICENSE` and `NOTICE`). The code in `dvp/` is MIT-licensed.

## How this was built

Built with AI assistance for drafting code, documentation and scripts. I used Claude, Meta AI, and Hermes (an agent in my own WSL, running an NVIDIA Nemotron model via OpenRouter), plus a single question to ChatGPT. I made the design decisions, ran everything on devnet, and checked each claim against the chain myself.

What was mine: I chose DvP and the PDA-as-authority idea, and I decided what counted as proof: nothing goes in the deck without a signature. I pushed to put the limits on a slide before anyone asked, and I noticed the deck under-sold TrustRail Core. I ran every command on devnet and pasted the real output, including the failures, and several of the best decisions came from that.

The boundary I held:
- AI was used for velocity: drafting programs, scripts and documentation.
- Signing keys stayed in local keypair files that are not in this repository, and no seed phrase or signing keypair was ever pasted into an AI chat.
- As of commit ee02f2b, I scanned this repository's git history for key material and found none (`scripts/keyscan.py`).
- Where an AI draft and the chain disagreed, the chain decided.
- Every result in the deck points to a transaction signature. Limits are stated as limits, not as results.

Account checks (PDA seeds and bumps, `has_one` on the issuer, signer requirements, and owner and key comparisons on the DvP record) are in `program/programs/referee_stub/src/lib.rs`.

AI drafted a lot, but I ran every transaction in the receipts myself.
