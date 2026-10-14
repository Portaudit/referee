// Copyright 2026 Ishvir Jackpersad
// SPDX-License-Identifier: Apache-2.0
//
// settle-stub.ts: Test B client. Calls the referee STUB's settle_stub, which
// CPIs DvP SettleDvp with the authority PDA signing.
//
// Dry run by default (simulate only). SEND=1 sends, only after a clean simulation.
// Required env: NONCE. Optional: SEND, RPC_URL, WALLET, PROGRAM_ID, IDL,
// USER_A, USER_B, MINT_A, MINT_B.

import { readFileSync } from "node:fs";
import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getAddressDecoder,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";

function die(msg: string): never {
  console.error("STOPPED: " + msg);
  process.exit(1);
}
const j = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2);
const home = process.env.HOME ?? die("HOME is not set");
const envOr = (k: string, d: string) =>
  process.env[k] && process.env[k] !== "" ? (process.env[k] as string) : d;

// ---- constants (from the project notes; the PDA is the provisional one) ----
const DVP = address("dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq");
const MEMO = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const PROGRAM_ID = address(envOr("PROGRAM_ID", "EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe"));
const EXPECTED_PDA = "GE7FbxTFG1ExcvCCuqScLxto65uw5rHqQFpwrH3cDyew";
const EXPECTED_DISC = [218, 84, 8, 160, 58, 239, 144, 66];
const USER_A = envOr("USER_A", "FbCeN7dc9z7GQLa7ZYhNoc6GJnEpxobFQQ7uLgnnKkMJ");
const USER_B = envOr("USER_B", "5durZuNjjh62qELd6KkfwUJ6NGPfsSwL1qoxwm8cQNRB");
const MINT_A = envOr("MINT_A", "8CvA8L1qM9EHpCWdfhhAppd1dSprE1XayXV9WLbbU4uL");
const MINT_B = envOr("MINT_B", "ChaybgtbUUcE4PRtDJKunX2mYUTbhrpBp1mLkoCa2MUv");
const RPC_URL = envOr("RPC_URL", "https://api.devnet.solana.com");
const WALLET = envOr("WALLET", `${home}/fall-school-wallet.json`);
const IDL_PATH = envOr(
  "IDL",
  `${home}/solana/fall-school/referee_stub/target/idl/referee_stub.json`,
);
const SEND = process.env.SEND === "1";

const nonceRaw = process.env.NONCE ?? "";
if (!/^[0-9]+$/.test(nonceRaw)) die("set NONCE to the trade's nonce (digits only)");
const NONCE = BigInt(nonceRaw);
if (SEND && NONCE < 1004n) die("SEND requires NONCE >= 1004 (1001 to 1003 are used)");

const enc = getAddressEncoder();
const dec = getAddressDecoder();
const text = new TextEncoder();
const u64le = (n: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};

async function main() {
  // 1. the IDL is the source of the discriminator
  const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
  const ixIdl = idl.instructions.find((i: any) => i.name === "settle_stub");
  if (!ixIdl) die("settle_stub not found in the IDL");
  const disc: number[] = ixIdl.discriminator;
  if (disc.length !== 8) die("IDL discriminator is not 8 bytes");
  if (j(disc) !== j(EXPECTED_DISC)) {
    die(`IDL discriminator ${j(disc)} differs from the one recorded (${j(EXPECTED_DISC)}); stop and look`);
  }
  const decl = ixIdl.accounts;
  if (
    decl.length !== 1 ||
    decl[0].name !== "authority_pda" ||
    !decl[0].writable ||
    decl[0].signer
  ) {
    die("IDL accounts are not exactly [authority_pda writable, not signer]; stop and look");
  }
  console.log("IDL ok: settle_stub discriminator " + j(disc));

  const rpc = createSolanaRpc(RPC_URL);

  // 2. the stub must exist on devnet
  const prog = await rpc.getAccountInfo(PROGRAM_ID, { encoding: "base64" }).send();
  if (!prog.value) die(`no account at ${PROGRAM_ID} on this RPC: the stub is not deployed`);
  console.log("stub program account found, executable=" + prog.value.executable);

  // 3. authority PDA (provisional seeds ["authority"])
  const [authority, authBump] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [text.encode("authority")],
  });
  console.log(`authority PDA ${authority} bump ${authBump}`);
  if (authority !== EXPECTED_PDA) die(`authority PDA differs from ${EXPECTED_PDA}`);

  // 4. the trade record
  const [swap] = await getProgramDerivedAddress({
    programAddress: DVP,
    seeds: [
      text.encode("dvp"),
      enc.encode(authority),
      enc.encode(address(USER_A)),
      enc.encode(address(USER_B)),
      enc.encode(address(MINT_A)),
      enc.encode(address(MINT_B)),
      u64le(NONCE),
    ],
  });
  console.log(`swap_dvp PDA for nonce ${NONCE}: ${swap}`);
  const rec = await rpc
    .getAccountInfo(swap, { encoding: "base64", commitment: "confirmed" })
    .send();
  if (!rec.value) {
    console.log("no account at that PDA: not created yet, or already settled/rejected/closed.");
    process.exit(2);
  }
  if (rec.value.owner !== DVP) die(`record owner is ${rec.value.owner}, not the DvP program`);
  const bytes = Buffer.from(rec.value.data[0] as string, "base64");
  if (bytes.length !== 458) die(`record is ${bytes.length} bytes, expected 458`);

  const at = (o: number) => dec.decode(bytes.subarray(o, o + 32));
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const r = {
    userA: at(1), userB: at(33), mintA: at(65), mintB: at(97),
    authority: at(129), tpA: at(161), tpB: at(193),
    expiry: dv.getBigInt64(241, true), nonce: dv.getBigUint64(249, true),
  };
  console.log("record: " + j(r));
  if (r.authority !== authority) die("record authority is not our PDA");
  if (r.nonce !== NONCE) die("record nonce differs from NONCE");
  if (r.userA !== USER_A || r.userB !== USER_B || r.mintA !== MINT_A || r.mintB !== MINT_B) {
    die("record parties or mints differ from the expected ones");
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  console.log(`expiry (read as i64 LE, type unverified) minus now: ${r.expiry - now} s`);
  if (SEND && r.expiry <= now) die("trade looks expired; refusing to send");

  // 5. the twelve SettleDvp accounts after the authority, then the DvP program
  const ata = async (owner: string, tp: string, mint: string) =>
    (await findAssociatedTokenPda({
      owner: address(owner), tokenProgram: address(tp), mint: address(mint),
    }))[0];
  const W = AccountRole.WRITABLE;
  const R = AccountRole.READONLY;
  const rest: [string, string, AccountRole][] = [
    ["swap_dvp", swap, W],
    ["mint_a", r.mintA, R],
    ["mint_b", r.mintB, R],
    ["dvp_ata_a", await ata(swap, r.tpA, r.mintA), W],
    ["dvp_ata_b", await ata(swap, r.tpB, r.mintB), W],
    ["user_a_destination_ata_b", await ata(r.userA, r.tpB, r.mintB), W],
    ["user_b_destination_ata_a", await ata(r.userB, r.tpA, r.mintA), W],
    ["user_a_ata_a", await ata(r.userA, r.tpA, r.mintA), W],
    ["user_b_ata_b", await ata(r.userB, r.tpB, r.mintB), W],
    ["token_program_a", r.tpA, R],
    ["token_program_b", r.tpB, R],
    ["memo_program", MEMO, R],
    ["dvp_program", DVP, R],
  ];
  console.log("outer accounts (position 0 first):");
  console.log(`  0 authority_pda  ${authority}  WRITABLE (not a signer)`);
  rest.forEach(([n, a, role], i) =>
    console.log(`  ${i + 1} ${n}  ${a}  ${role === W ? "WRITABLE" : "readonly"}`),
  );

  // 6. build, sign, simulate
  const payer = await createKeyPairSignerFromBytes(
    Uint8Array.from(JSON.parse(readFileSync(WALLET, "utf8"))),
  );
  console.log("fee payer " + payer.address);
  const ix = {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: address(authority), role: W },
      ...rest.map(([, a, role]) => ({ address: address(a), role })),
    ],
    data: Uint8Array.from(disc),
  };
  const { value: bh } = await rpc.getLatestBlockhash().send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
    (m) => appendTransactionMessageInstruction(ix, m),
  );
  const signed = await signTransactionMessageWithSigners(msg);
  const wire = getBase64EncodedWireTransaction(signed);

  const sim = await rpc
    .simulateTransaction(wire, { encoding: "base64", commitment: "confirmed" })
    .send();
  console.log("simulation err: " + j(sim.value.err));
  console.log("units consumed: " + sim.value.unitsConsumed);
  console.log("logs:\n" + (sim.value.logs ?? []).join("\n"));
  if (sim.value.err) {
    console.log("simulation failed: not sending.");
    process.exit(3);
  }
  if (!SEND) {
    console.log("dry run only. Set SEND=1 to send.");
    return;
  }

  // 7. send and poll
  const sig = await rpc.sendTransaction(wire, { encoding: "base64" }).send();
  console.log("sent: " + sig);
  for (let i = 0; i < 30; i++) {
    await new Promise((res) => setTimeout(res, 2000));
    const st = await rpc.getSignatureStatuses([sig]).send();
    const s = st.value[0];
    if (s) {
      console.log("status: " + j({ confirmationStatus: s.confirmationStatus, err: s.err }));
      if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") break;
    }
  }
  console.log(`verify with: solana confirm -v ${sig} --url devnet`);
}

main().catch((e) => {
  console.error("ERROR: " + (e?.message ?? e));
  process.exit(1);
});
