# Fixes found in my own review, 18 October 2026 (UTC)

On 18 October 2026 I read Referee's checks against the Cantina review of the Solana Foundation's DvP program (that review covers DvP, not Referee) and found four issues in Referee. None was exploited. The first could have cost a party one leg's proceeds if they co-signed a bad record without checking it. The other three are liveness or footgun issues. All four are fixed in two in-place upgrades and were tested on devnet.

Refusals marked "simulation" were run as simulations against the live program, so they have no signature. Everything else below is a transaction you can open with `solana confirm -v <signature> --url devnet`.

## The two upgrades

| Upgrade | Size and sha256 | Slot | Signature |
|---|---|---|---|
| Sixth (destination fix) | 233,008 bytes, `ce2c09e89d40af87eef6a597ca7f5a9848eed82e5ac9e09f0b75c0f4fe8dce5f` | 512319874 | `28ojVfL3s3xwacbgkkiCStF4RUgBUXrikCJkf8CVx6j99AKq1VD9Wcm16U9GRzZtPGGZi2Gbbkve3fQVg272bUwe` |
| Seventh (refund address, settle window, credential renewal) | 234,528 bytes, `50eacefc5be4d1de685f66e6baf33b18e65fd1d3c4c6ec4df045f71b00946b30` | 512327069 | `3YHk1o4o32FhZi4oepTLodvuJzKGFYwb9fcmBdxyPP2yBHsAfyzBsxXhYo1qaGzJiNsQQRsY2U87MYUaZHrFLL4p` |

After each upgrade I dumped the live program data. Its first bytes matched the build and the rest of the account was zeros.

## What I found and fixed

1. **Registration accepted an all-zero settlement destination.** The check treated all-zero as "no redirect". DvP actually stores a missing destination as the user's own address, so all-zero is an explicit destination that nobody can spend from. DvP 1020 was created with one. Before the fix the live program accepted it (simulation: `trade registered`). After the fix it is refused with `DestinationRedirected` (6009, simulation). The fix requires each destination to equal the party's own address.
2. **A zero refund address was accepted.** It is now refused with `RefundToInvalid` (6017, simulation on DvP 1022).
3. **There was no minimum settle window.** A record expiring in one second could be registered. Registration now requires at least 600 seconds between the later of now and the record's earliest time, and its expiry. Otherwise it is refused with `WindowTooShort` (6018, simulation on DvP 1023, created with a two-minute expiry).
4. **Credentials could not be renewed after an issuer change.** `set_credential` did not update the credential's issuer, so credentials from a previous issuer stayed invalid for good. On the old build, settling DvP 1021 was refused with `CredentialIssuer` (6011, simulation). `set_credential` now re-binds the credential to the current issuer.

## Transactions

| What | Signature |
|---|---|
| DvP 1020 create (user A destination all-zero) | `5cMLVPdrtmoVABqVNnLQg9yDdDWobzBSW85mPXaRJqS4xxLfsLfBGsHyMAFouPNJh2oCoFEirvZBMZu1TgMcezbU` |
| DvP 1021 create | `4Xqq3aMTMmcvQCi1h8csbRETnNN2uYHt3ZTUVXxAEMSPmCNBrrnjypsBQG4f4ayKRJ7NGTAF1z2VR8sVd5FV7V3o` |
| DvP 1021 fund | `jVHaq4Ab45B5xrWkEb8r8PTc4z3XyeYSN9KyQ5dPKwBzbjWa5weJA95AkTdqmfGFPnAYwCdRJMaW5WyUyUuZ12n` |
| DvP 1021 register (normal trade, patched destination check) | `31itKUMp1JazLPsJG41W8HLunnPv3hnr3yrWZsrLMEBTQ3Qu8DprcBDLGRYBd3rvV8VcBm8NhdfrNqTk9QPjEG4M` |
| DvP 1022 create | `qP3vJUgD9w1FZheAujYEj2xZH5HAPqhsJTyokUvbRw5AZYcrpv5CbGy9jy6iXC3JY5ijumUNN9dbp8DYXevSDcH` |
| DvP 1022 register (normal trade, after the seventh upgrade) | `5Hufiztzf5eA14W1tYyqjq8AiET1t77DNfksnJJKep5a3v29Eqwz86nckoMnajPgx9EhvGrDBCnV6N3rKr85GqPL` |
| DvP 1022 fund | `3KnWGTzaed1quSui1hMwXc9PExzTw29kf1tWSgpU2kgkfdvEqS97ri6wQHxQ4cCamrRhvCFYoAdmRWeM2DcrgDya` |
| DvP 1023 create (two-minute expiry) | `tQrzsNydTWPf9mcTCKyemXwFgECd5ND2z1fbE5mrTdWmZgEBYWsWiVKHHoHVQTif5TdTDGoqfnSt4MFSzQuyZe1` |
| Credential renewal test: issuer set to a key I hold | `4uS28qjja5nWAcod4BDGoSBoZ8Ea5YvoF9kDHTMdUR5u7WqdmdxrL8AC7FEJ1n8C6FedKWyLKd99Pu1DqBNM8crE` |
| `set_credential` for party A, re-binding it to the current issuer | `dENvZDvNECjnjVvaSq4auFkmfHUohXhpMkQ91UZXVwEJoVXJXEAnK4UmtLfeAN7tuXTJLvzzwXU1geFVjy8ijN7` |
| `set_credential` for party B, re-binding it to the current issuer | `xitXz7kNx18EL1KkcQYBNv6MS8iJBJiqdwAjpCCinaqkBpN7z2Q5QR4X9NBSyfJFU2usEzb57PaXthpT7Wiv4AM` |
| Settle DvP 1022 after the renewal | `58a3e7BhhhvWp48ew6vHw86fRG7eUGyw7h2sTsDrxYMhSM4v4dTgCP5roQ5dvuz2i2byUzpG3xAs58CnAQidbFjT` |
| Issuer set back to the Verifex PDA | `31stmKaf2K2BtXMABjarN5FbyrHaEhxUchVEvVvFtRGj1sQaPzzpn3rXqvHS7Ref6xSPfXvJeUPyjBuGLLJ6Jy6n` |
| DvP 1021 reject, after it expired (Reject has no expiry check) | `4jiWjMPyXmpsdLXRxmumKBh5TjP5a7SGvWusPJQ8pJyYxxf27vX7w3tCjFUdWvkTfgWXGAk5aZ2qSPda1vHuo82X` |
| Referee `close_trade` on 1021, on the seventh-upgrade build | `4snZFVjhtjEqerzPEy6qZf4SsiKgjG1KhTFh4Qkk8WUUzJ1YfpN5urhej6Eogkn3DvczfXvZkNG3gwYNgqy3fkwk` |

DvP 1021 expired unsettled at about 05:49 UTC, one hour after it was created. I then rejected it and closed Referee's trade record, which also ran `close_trade` on the upgraded build. After the renewal test, the credentials of parties A and B are bound to the key I used for the test, so they are not valid under the Verifex issuer.

## What I did not fix

- Inherited from DvP and acknowledged in the Cantina report (findings 3.3.2, 3.2.3 and 3.3.1): mint authorities can freeze or claw back escrow, dust can delay a settle, and closeable mints can change behaviour after creation. Referee does not change how tokens move and adds no mint policy of its own: refusing every mint with a freeze authority would also rule out stablecoins such as USDC, so I disclose it instead.
- Referee's own scope: its settle passes no transfer-hook extra accounts, so mints whose hook needs extra accounts cannot settle through Referee, although DvP supports them.
- DvP lets a creator choose any settlement destination, including an all-zero address. Referee now requires each destination to be the party's own address.
- Referee reads DvP records by fixed offsets for a 458-byte layout. If the length changes it refuses, which is safe. A change that keeps the length but moves fields would not be caught.
- Expiries use cluster time, which lags wall-clock time by roughly 10 to 30 seconds.
- The admin key is hard-coded in the program.
- Verifex's base path does not bind the presented agent program to the credential's subject. Its credentials last seven days and cannot be renewed by Verifex.
- The build hash has not been reproduced on another machine.
- The devnet DvP deployment was last deployed at slot 479376863. It refuses nonce reuse (see above), which is one of the audit's fixes, but I have not checked it against every fix in the audited source.

## Checked and found correct

- **Record layout.** `scripts/check-layout.py` parses DvP's serializer (`to_bytes` in `state/swap_dvp.rs`, source commit df9919e) and Referee's offset constants. All 11 offsets Referee reads match, and the record length matches at 458 bytes. Run on 18 October 2026: ALL MATCH. This checks the source I cloned, not the deployed binary. The trades registered and settled on devnet that day exercised the deployed layout.
- **Settle window.** The 600-second minimum is the value Cantina recommended for DvP in finding 3.3.11, which the report marks acknowledged. I did not find the check in the DvP source I cloned. Referee's check is stricter: it measures from the later of now and the earliest settlement time, and it also applies when no earliest time is set.
- **Nonce reuse.** On the devnet DvP, re-creating a closed DvP (nonce 1021) is refused with `NonceAlreadyUsed` (error 13; a simulation, so it has no signature). That is the behaviour of the nonce-tombstone fix for Cantina's finding 3.1.4, so the deployed program includes at least that fix.

## DvP baseline, taken 2026-10-18T05:32:13Z

Last deployed slot 479376863, 128,656 bytes, sha256 `9edf3e6764736c5a3277b01ca7be9397ce00a4ccdc0338ed6f655750b74eaafb`.
