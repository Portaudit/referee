# Receipts

Every claim in this repository's README maps to a transaction on Solana devnet. Nothing here is mocked. Check any row with:

`solana confirm -v <signature> --url devnet`

All of it ran on 14 October 2026 (UTC) against the Solana Foundation's DvP program (`dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq`) and the REFEREE program (`EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe`). The authority PDA is `GE7FbxTFG1ExcvCCuqScLxto65uw5rHqQFpwrH3cDyew`. The demo issuer is `BbZBpYf7UW7nocu9TVrQkpVoA7HhjvKXvozhMRoA5uFY` (a keypair controlled by the project author). Unaudited. Devnet only.

## The program and its upgrades

| Step | What it shows | Signature |
|---|---|---|
| Stub deployed | A first, minimal program (152,160 bytes) | `39CPt6shRKxRBFPwWUeCT4Mj9BLGq4n2HoLB4rXiUqs41JtjMGLkb6ZGno1vLfVBJVr1GvJFZJj4tSD6yGks79UL` |
| Upgrade 1 | Registry, credentials and gated settle replace the stub (215,176 bytes) | `4ispfRHSCsUQxSbek8tkfC7EX9Jxqdaj5qoY5VaZuuDGatpepeX54xdte3qTsrHqq2b47P1KW5FRacTxQ63X4JQL` |
| Upgrade 2 | Settle returns the rent DvP sweeps (216,288 bytes) | `5WtT9xPZduEtfQeHp5bG2g3Hy4a1EmoF4ZuFNve5Ss5oc5yut2KMoemNrp9F13Z8pcnVdtNik4rZz8Rm92Vm41Jq` |
| Upgrade 3 | Events and `close_trade` (227,496 bytes) | `2P47GeeeoggaTebnPHDsqJkYxeaVL1NcsDvMKKhPitoTdP9qDR3tq1Mcn17h73tAqYNLazws52tAfFBDxCHkQXnH` |

## The core claim: a program-derived address settles a DvP trade

| Scene | Signature |
|---|---|
| The stub's PDA settles a funded DvP trade (first proof) | `2KZbaS3xcQ7AygZVYNzJYfYWfd8R6PJeZjn2b2xTNib8mRHmY5KNJ3LktJAaJYQn6zosZZNxsqxovT8vNNcTfYoK` |

## Setup

| Step | Signature |
|---|---|
| Config created | `CysbAL2ppz8Bv2PFzN4edAjmWd89WRz56MVPnFSMeBivD8d3SbB1TcGnEq12ZPCchMW47atFKKcNrsswDLqYkFP` |
| Credential issued to party A | `2XDS5xNWH4tbUBcCsSJhWAFnTfiifFze1etenPFv2HzVLCuzCb7ALAvLpqQHZxC8qACnAfjTzQTZT4aySAqVXxh7` |
| Credential issued to party B | `2SzAXDQqiFDNSeDsgWuhdj59FVtQ1RBYmDbWakMCBYGrEtoXshFExe2pUdY5dqsZt6DWRgjznnePNpmDGtcN5XHY` |

## Refusals (failed transactions kept on chain)

| Scene | Error | Signature |
|---|---|---|
| Settle a trade nobody registered | `AccountNotInitialized` (3012) | `5o35xSWPBD3UwbqPR3Mv9DzB6UwzKDgFbPMUeaCEr93WG3r5hpjges2QxnbeEQys2j35xmCbdDtB4qZqWfvir6Nt` |
| Settle after a credential was revoked | `CredentialNotEligible` (6012) | `33vzuzwjHSkZboQXgEF1viwdfxtjoprzsFFx16K1ATwJMbKpPafyA1wWHmNNbQcTahL8fhLx3K1jiPdJrCuKfkYc` |
| Close a registration while the DvP trade is still open | `TradeStillOpen` (6016) | `2zePt15vxgicy8T6SCJsHTKwJD851ZAUDbxG4fz7c5nHZnUzABB871jhVucaiydTs7vRqbH8cmx3FtDkx8MmERPa` |

## Registered, credentialed trades settle

| Scene | Signature |
|---|---|
| Register (trade 1005) | `4tDYgMoBKW8ABaaLyArQNMxDUNEFqPeJEQiDnQFJDsJnVUNrAqz2uLSQzUu17h79dRcfQ5QfCkhn9gswpBWjX3na` |
| Settle (trade 1005) | `5MUcDHFsGo5kb46NHjixqJ4PX9wbGFAi4ib2LoFc7Wc1RD28QAfVtHw28AVQUzacPqo8GQ7ief65Wry7Q2fEEHLe` |
| Register (trade 1006) | `4W9yeLMzBvCu8FmzL2FJmASyds4forHqx7igBC62mK3XtJyCaX7mGNQUAwFvnfpyvpJ1THvdRN75kuX41DVx7ec8` |
| Settle, rent returned to the chosen address (trade 1006) | `3oShWDTisvoxHp5r72E61xVzDRJb6zdNctRoyXWJpMHg5MxRLYJHHpJBp2KEWAAnGco2e9qgHEie5sKHf3kCmCaD` |
| Credential revoked | `2AJyPXqwQb2x4xktt2jZmSgjWjZD9ghsQ4zLumme4T5EhmpHUzV41j55U8QNbHvNX92obq7CycrTTXWRaoeekiPS` |
| Credential renewed | `5QWgS1vvzVFF2ZiJTzq7kEpbj3DBSsoPVqrDE9oYrkfUumHTk2CgcTn4a7zTwmg6LQkjscrVRb8Cbr1scTymjcDS` |
| Settle after renewal (trade 1007) | `JXEVRbCdeyqRWMSQVakSCd7Dhf1D5fTVhj32JpTc8ujfBhSX3pR4LSMGUxPhdoKcHjAwdncQ2E7pY1CvaUirX9k` |
| Settle with a `TradeSettled` event (trade 1009) | `38tTcya12Dig9Th8nP9YGnwFo1nx3mnDvKJ46djqcNwoRgGpTYUU6Zkw6fAMjuhd4rbW46kviQCB1H7xENVMM4cG` |

## Anyone can settle

| Scene | Signature |
|---|---|
| Trade 1010 settled with a fresh key as the only signer and fee payer (`H2rEU3uLgNPqZcAFwZ6WbyxR51uq9n6dk3ReWMxvDdg5`) | `5i15Zt2RC69h7nApeu6NcT1vBsWK46JnQaLkUVTFmhr4nbU8ELDG7MgXu1PNyUX7VVHPyk9VJzzBwjJmbdGaUJTK` |
| Trade 1011 settled by the keeper script, which found the trade by itself | `3QvEpzWQxhSQoZ3aQu93ryFVb7eiXEiKKSixBqMa6PELeArh46Un61oZM5Am5WjW2nAW9xS9gNJAJqi7jai5huwR` |

## Unwinding a trade

| Scene | Signature |
|---|---|
| A party rejects through DvP (trade 1008) | `3XS1DSx4xehvaDEkY8LrimxbrGkPb1GQGCJicK3gtqQoT2CrwqnwG1caPDGZNFYTBproRAjGu2bQZC3nW4zJUaKb` |
| `close_trade` returns the registration rent (trade 1008) | `3Nh5MzuAK9TghTSnSJFYs5MXaeHXcUqtuwvES67GMDMKWc56oB8Uhp2xxBXEmUFwvEmSREZtVgWDvixNeHzhNZ3s` |

## Reading the whole history

`scripts/ledger.ts` lists the program's transactions and decodes its events from the logs. It only reads devnet.
