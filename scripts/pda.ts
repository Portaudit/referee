// Copyright 2026 Ishvir Jackpersad
// SPDX-License-Identifier: Apache-2.0

import {
  address,
  createSolanaRpc,
  getProgramDerivedAddress,
  getUtf8Encoder,
} from "@solana/kit";

const pid = process.env.PROGRAM_ID;
if (!pid) throw new Error("PROGRAM_ID missing");
const [pda, bump] = await getProgramDerivedAddress({
  programAddress: address(pid),
  seeds: [getUtf8Encoder().encode("authority")],
});
const rpc = createSolanaRpc("https://api.devnet.solana.com");
const info = await rpc.getAccountInfo(pda, { encoding: "base64" }).send();
console.log("PDA=" + pda);
console.log("BUMP=" + bump);
console.log("ACCOUNT=" + (info.value ? "exists (unexpected)" : "none (expected)"));
