# Referee on-chain program (Anchor)

Source of the program deployed on Solana devnet at `EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe`.
The package keeps the name `referee_stub` because it was upgraded in place from an earlier stub.

Deployed binary (after the seventh in-place upgrade, on 18 October 2026): 234528 bytes, sha256 `50eacefc5be4d1de685f66e6baf33b18e65fd1d3c4c6ec4df045f71b00946b30`; the live program data holds these bytes followed by zeros. Earlier builds: fifth upgrade (adds `set_issuer`) 233056 bytes, sha256 `0ca7e752be598b4ff3f38f6ad93f5fe7c4d7436f9c93a281e3dcbb38708f1a5b`; sixth upgrade (destination fix) 233008 bytes, sha256 `ce2c09e89d40af87eef6a597ca7f5a9848eed82e5ac9e09f0b75c0f4fe8dce5f`. The minimal Verifex program is in `programs/verifex_min` (deployed binary 96328 bytes, sha256 `c45b4185648e4b844bcfeea638cd629f9e3762b62fb41807f5e4c08f5b467486`).
Built with `anchor build` (anchor-cli 1.2.0, Rust pinned to 1.89.0 by `rust-toolchain.toml`). Whether the
hash reproduces on another machine is unverified. This binary was uploaded with Solana CLI 4.1.2; the 3.1.10 CLI rejected it.

Unaudited. Devnet only. Classic SPL Token and plain Token-2022 legs (mint extensions are not checked). Independent project; not affiliated with or endorsed by
the Solana Foundation or J.P. Morgan.

Verifex after its first in-place upgrade (adds `verify_outcome_and_issue`): 106136 bytes, sha256 `1ce32cc8ee76e5b0cf2bb78041840749441d9418af30ac57dedf2a8843ab7992`; its program data was extended to 116328 bytes first.
