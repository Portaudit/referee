# TrustRail Core (patch only)

TrustRail is a separate project by the same author (github.com/Portaudit/trustrail-pipelines) and is unchanged. This folder holds only a patch that turns a checkout of it into a devnet-only copy under new program IDs, used for the Verifex Core scene in docs/RECEIPTS.md. The fork itself is not published.

- Upstream commit the patch applies to: `49b63ad57e80763082f623048542b8c92c0a5932`
- Changes: new `declare_id!` / Anchor.toml / worker program IDs, and the worker reads its wallet from the `CORE_WALLET` environment variable instead of a default keypair path.
- TrustRail Core program: `58t4gi88MNSURkwN6GuGugmXWPFqAT6s9pB56Srx4Bez` (268,368 bytes, sha256 `f8e5460edccc1007b81d9b86c873390309eccad4004bd62a84bdbb922f932c43`)
- Mock swap: `8HL9DS7VsiLRqVwQVkRZxZDm25JgieCVLG4Brjb8oe7u` (114,280 bytes, sha256 `a1fdd5646d66572a282fa5374a50717700c8fc3bee443156d36f5f8ed385bd47`). It is a fixed 1:1 stand-in, not a market.
- Apply: check out the upstream commit above, then `git apply trustrail-core.patch`. A rebuild reproducing these hashes has not been verified.
- Limits: TrustRail's `Passed` compares the output account's balance with a minimum, so a donation to that account could satisfy it. Both programs are upgradeable by the author's wallet. Devnet only, unaudited.
