# Referee on-chain program (Anchor)

Source of the program deployed on Solana devnet at `EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe`.
The package keeps the name `referee_stub` because it was upgraded in place from an earlier stub.

Deployed binary (after the fifth in-place upgrade, which adds `set_issuer`): 233056 bytes, sha256 `0ca7e752be598b4ff3f38f6ad93f5fe7c4d7436f9c93a281e3dcbb38708f1a5b`. The minimal Verifex program is in `programs/verifex_min` (deployed binary 96328 bytes, sha256 `c45b4185648e4b844bcfeea638cd629f9e3762b62fb41807f5e4c08f5b467486`).
Built with `anchor build` (anchor-cli 1.2.0, Rust pinned to 1.89.0 by `rust-toolchain.toml`). Whether the
hash reproduces on another machine is unverified. This binary was uploaded with Solana CLI 4.1.2; the 3.1.10 CLI rejected it.

Unaudited. Devnet only. Classic SPL Token and plain Token-2022 legs (mint extensions are not checked). Independent project; not affiliated with or endorsed by
the Solana Foundation or J.P. Morgan.
