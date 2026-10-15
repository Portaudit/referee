# Receipts

Every claim in this repository's README maps to a transaction on Solana devnet. Nothing here is mocked. Check any row with:

`solana confirm -v <signature> --url devnet`

It ran on 14 and 15 October 2026 (UTC) against the Solana Foundation's DvP program (`dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq`) and the REFEREE program (`EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe`). The authority PDA is `GE7FbxTFG1ExcvCCuqScLxto65uw5rHqQFpwrH3cDyew`. The demo issuer is `BbZBpYf7UW7nocu9TVrQkpVoA7HhjvKXvozhMRoA5uFY` (a keypair controlled by the project author). From the fifth upgrade on, Referee's configured issuer can be the Verifex program's PDA `72PiHwHvMASwKLJoc76VkheqLyxaUDeRV69DM9graiGz`; the credentials in the Verifex section below were issued by it. Unaudited. Devnet only.

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

## Token-2022 legs

Plain Token-2022 mints only (no extensions). Referee accepts the Token-2022 program ID and does not check mint extensions.

| Scene | Signature |
|---|---|
| DvP alone, keypair authority (trade 2001): create | `3Ub5jE1NUMc3uYd2Wj1A7rRnkQ3gUkSAzN38okxSFh1JkLwmiT4m9UGEVnP1h659rGQWqLkAZHvGWbhjAnp39CmA` |
| DvP alone (trade 2001): fund | `5JYX8PzWXoszvuYG6x2SKwszmf9SZknqUTxKxX8Kz24SxM6fhLbUUz8fa7b6HCUp4brhyeuPPmjV4brfc9ThwF72` |
| DvP alone (trade 2001): settle | `3Egn2J1rkWqbDnDjhGHTtpPLWLdAeQRT66n7RwYfKqdZ5jY3ouM3peJqPd7wLVN2kuyMyWW9qRDLMs4E9RFM988o` |
| Fourth in-place upgrade: registration accepts the Token-2022 program ID | `2HrvwvhcYNWunBLdEd55eAfcsjtNXyr9coDsorhs8w5Su2pTU54RNak3et8o9gTcgE4SXrM1pCdUC4ji6EfTtf8A` |
| Referee-gated trade, authority is the PDA (trade 2002): create | `4bbzL5MAxjpboiSzKwhJpZBVnuReBuSJfJE7BuxVjwGfckL6UGRja57WruiV44EfCzUxdn8BbJrf4hmg5Qv6ctdB` |
| Referee-gated trade (trade 2002): fund | `35RDU1M3TWMM9Rk6zkixDog9vjnE82ZS6yWrBPPPJbGuXLzkCYjn8PCwWUSpXTjzJ97aLTzthgm7CB2BPtjxy9y8` |
| Referee-gated trade (trade 2002): register | `4XQFrrCJb2eSYnhmt3A1aYmWwKAQPhamznJBayuSfwJS3q91txaSayQ4nMmBqvsyW1dicqYEpAxbWsAHZrfYQC9Z` |
| Referee-gated trade (trade 2002): settle, rent returned to the chosen address | `5u4hqtuQdt9a3AL6k1tjwPGEko1XiJCmaDnGWcMR6c9FoK6JuEunRPHRNwkmCMTxscnYSrN7V2qVNXqx5Lk7NtGn` |

## Verifex: a program issues the credentials

A minimal Verifex program (`4GTqnRnN4ZDTzHf2EeqQW98RhDAtCkwG7vTgaPapR4Qs`) runs one check, that the presented agent program has no upgrade authority, and then calls Referee's `issue_credential` as the issuer, signing with its own PDA. This demonstrates the issuer path. It does not bind the presented program to the subject's identity, and the two agent programs here are stand-ins: the classic Token program (no upgrade authority on devnet) and Token-2022 (upgradeable). Referee's admin pointed the issuer at Verifex's PDA with a new admin-only `set_issuer`.

| Scene | Signature |
|---|---|
| Verifex program deployed (96,328 bytes) | `4M81UFX89uPW1bc5zW1hRvq4ueBJwEqkAKDZ6euG5So6jbj7MCtLTT7VU4UWY7SV4yEvGz6buUCbMmPqW41Ps27R` |
| Fifth in-place upgrade adds `set_issuer` (233,056 bytes, sha256 `0ca7e752be598b4ff3f38f6ad93f5fe7c4d7436f9c93a281e3dcbb38708f1a5b`) | `2Py1tTyR3mUwtzoZpxyCT3pEVC4y69mSCEHgs5PC5KrzUA4ZzdakSWsVf8YJLi1vkSnzjT1dyLSwMs3QFxA4d1fv` |
| Referee's issuer set to the Verifex PDA | `3YWaV5rUSKnytE6X38ZbVqjdF7NgqyJxkuMfjW8zseUo8RyNcEqB3htprFfWYqxMLSMxPxQNAmynbisFf8SZstjn` |
| Agent B presents the Token-2022 program (upgradeable): Verifex refuses, `AgentNotImmutable` (6002) | `5KCURHKamfaw6XK71XF2WnbQSkjsUbbf51DFgwMewcPBKJDCm6MmaHSQBATPBRv6hiJqcFzMma7DaDLWfhXUDWtF` |
| Agent A presents the classic Token program (immutable): Verifex issues party C's credential | `5TgLoDP6d5AFRoJAMTUvQhBaduM8UV48fWF2cEX8EKhgqugv1F82gAjapHQ8xWotTpf4s4M7oH9os7BfxerwbFzN` |
| DvP trade 3001 between C and D: create | `5YUZRrJmFxF4fd6RHPwTGWkBwQiNA4tbJmiqpYhyzpoyTZ74xrkzAHRLoqTikhDD2VNdUMP9RLTjvMerJpAUkh5s` |
| Trade 3001: fund | `5v9JzRV6bUNgqCQYbmGhn15rCtENjo5Nu6diKgKY5ckoxRqtFpc79RRteKHryxXucvKGV9oTVLPPbvvQaS5g3FmH` |
| Trade 3001: register | `2MgTjEeubwGcFXFwKiJhUJN8HD4c8b9z4ti4RF5kP3JJCME7iLTnnnayk3cWMDnABgqXV63WF4rhixVgKz3CERiX` |
| Settle while D has no credential: refused, `AccountNotInitialized` (3012) | `5EJTsD5kN7Za5FbNBFh1SHgj75jSdnhPk7iAi94KSWA3TRcfqu4KASAGdM47EjWKSQAGbQqa2pUeBspcjDYwNa71` |
| D presents the immutable Token program: Verifex issues D's credential | `4yKndKZkXWR6FjAjWjkRpiMKjtE8gA8zJPziWzhf4oxR6vyriAzbyUxhiFXLbc4dvvSszY5RLQDJsrhiYTJKDkwb` |
| Settle with two Verifex-issued credentials, rent returned (trade 3001) | `3vHKabVU8sB3oZuaEuC9zGMVh8f9Gy6xZ3E62SbWQ8Bk3UyJqtU1sbUFyQyRAFuxa8Vv2abz8LrtN71yzi1J2rPm` |

## Reading the whole history

`scripts/ledger.ts` lists the program's transactions and decodes its events from the logs. It only reads devnet.
