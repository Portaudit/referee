# Can a program-derived address be a DvP settlement authority?

A feasibility note from the Referee capstone. Devnet only, unaudited. Independent project, not affiliated with or endorsed by the Solana Foundation or J.P. Morgan.

## The question

The Solana Foundation's DvP program swaps two token legs atomically. Each swap record names a settlement authority, and settlement needs that authority. If the authority is an ordinary keypair, settlement is only as trustworthy as whoever holds the key.

Can the authority be a program-derived address (PDA) owned by another program, so that the rules for settling live on chain, and anyone can trigger settlement when the rules are met?

## The answer on devnet: yes

A PDA has no private key. It can only sign inside a cross-program call made by the program it is derived from, using `invoke_signed`. So if a trade names that PDA as its settlement authority, the only way to settle it is through that program's code.

Referee derives its authority from the seed `["authority"]` and settles by calling DvP's Settle instruction (data `[2, 0]`) through `invoke_signed`. DvP itself is not modified.

Evidence, all on devnet and listed in `docs/RECEIPTS.md` and on the replay page:

- A stub program's PDA settled a funded DvP trade (first proof).
- The full program then settled registered trades, refused unregistered ones (error 3012), refused a revoked credential (6012), and refused closing a registration while the DvP trade was open (6016).
- A fresh key as the only signer and fee payer settled trade 1010, and a keeper script found and settled trade 1011.

## What the pattern needs

1. **The trade must name the PDA when it is created.** The authority is stored in the DvP record (a 458-byte account, authority at offset 129). It cannot be changed afterwards, so the parties choose Referee's PDA up front.
2. **A registration step.** The DvP record cannot carry Referee's own state, so both parties co-sign a registration (`trade` account, seeds `["trade", swap_dvp]`). `register_trade` checks that the record is owned by DvP, has the right size, names the PDA, matches the parties, has distinct signers, uses classic SPL token programs, has matching amounts, has not expired, and does not redirect destinations.
3. **Credentials as the gate.** In the demo, an issuer key writes a per-party `credential` account (seeds `["cred", subject]`). `settle` requires both credentials to be valid, unexpired and eligible.
4. **A fixed account order.** `settle` takes the DvP accounts as remaining accounts with the DvP program last, and builds the CPI from them.
5. **Rent handling.** DvP's Settle sweeps all rent from the record and escrows to the authority, which here is the PDA. `settle` forwards that amount, and the trade-registration rent, to the `refund_to` address both parties signed. Early test trades before this was added left about 0.0119 SOL in the PDA, and no instruction withdraws it.

## What it does not solve

- DvP's own upgrade authority is a trust assumption. Referee does not change who can upgrade DvP.
- The demo issuer is the author's own keypair. Credentials are a demonstration, not KYC.
- Only classic SPL token legs are supported, enforced in `register_trade`.
- The creator still pays fees and the DvP nonce account rent.
- Unaudited. The deployed binary's hash is published, but rebuilding it on another machine has not been verified.

## Reproduce it

- Source: `program/programs/referee_stub/src/lib.rs`.
- Scripts: `scripts/control.ts` (create and fund trades), `scripts/referee.ts` (config, credentials, register, settle), `scripts/keeper.ts`, `scripts/ledger.ts`.
- Check any signature yourself: `solana confirm -v <signature> --url devnet`.

## Next

Token-2022 legs, fees, a production credential issuer, a reproducible-build check, and an independent audit.
