// Copyright 2026 Ishvir Jackpersad
// SPDX-License-Identifier: Apache-2.0
//
// ledger.ts: read-only. Lists recent REFEREE program transactions and decodes the program's events
// (TradeRegistered, TradeSettled, TradeClosed, CredentialSet) from their logs, using the IDL.
// Env: LIMIT (default 30), OUT (write JSON to this new file), RPC_URL, IDL.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { address, createSolanaRpc, getAddressDecoder } from "@solana/kit";

const HOME = homedir();
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const IDL_PATH = process.env.IDL ?? `${HOME}/solana/fall-school/referee_stub/target/idl/referee_stub.json`;
const LIMIT = Number(process.env.LIMIT ?? "30");
const OUT = process.env.OUT ?? "";
const PROGRAM = address("EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe");

function die(m: string): never {
  console.error("STOPPED: " + m);
  process.exit(1);
}
if (OUT && existsSync(OUT)) die(`${OUT} already exists`);

const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
const events: any[] = idl.events ?? [];
if (events.length === 0) die("the IDL has no events");
const types: any[] = idl.types ?? [];
const addrDec = getAddressDecoder();
const rep = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

function field(t: string, b: Buffer, o: number): [string, number] {
  if (t === "pubkey") return [addrDec.decode(b.subarray(o, o + 32)), o + 32];
  if (t === "u64") return [b.readBigUInt64LE(o).toString(), o + 8];
  if (t === "i64") return [b.readBigInt64LE(o).toString(), o + 8];
  if (t === "u8") return [String(b[o]), o + 1];
  throw new Error("unsupported field type " + JSON.stringify(t));
}

function decodeEvent(b: Buffer): { name: string; fields: Record<string, string> } | null {
  for (const e of events) {
    const d = Buffer.from(e.discriminator);
    if (b.length >= 8 && b.subarray(0, 8).equals(d)) {
      const def = types.find((t) => t.name === e.name);
      if (!def) return { name: e.name, fields: { error: "no type definition in the IDL" } };
      let o = 8;
      const out: Record<string, string> = {};
      for (const f of def.type.fields) {
        const [v, n] = field(f.type, b, o);
        out[f.name] = v;
        o = n;
      }
      return { name: e.name, fields: out };
    }
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function retry<T>(f: () => Promise<T>): Promise<T> {
  let wait = 1500;
  for (let i = 0; i < 8; i++) {
    try {
      return await f();
    } catch (e: any) {
      const limited = e?.context?.statusCode === 429 || String(e?.message ?? "").includes("429");
      if (!limited) throw e;
      console.error(`rate limited (429), waiting ${wait} ms`);
      await sleep(wait);
      wait = Math.min(wait * 2, 20000);
    }
  }
  throw new Error("still rate limited after 8 tries");
}

const rpc: any = createSolanaRpc(RPC_URL);
const sigs: any[] = await retry(() => rpc.getSignaturesForAddress(PROGRAM, { limit: LIMIT }).send());
const rows: any[] = [];
for (const s of sigs) {
  await sleep(400);
  const tx: any = await retry(() =>
    rpc.getTransaction(s.signature, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }).send(),
  );
  if (!tx) continue;
  const logs: string[] = tx.meta?.logMessages ?? [];
  const ix = logs
    .map((l) => l.match(/^Program log: Instruction: (\w+)/))
    .filter((m) => m)
    .map((m) => (m as RegExpMatchArray)[1])
    .join(",");
  const evs: any[] = [];
  for (const l of logs) {
    const m = l.match(/^Program data: (.+)$/);
    if (!m) continue;
    const ev = decodeEvent(Buffer.from(m[1], "base64"));
    if (ev) evs.push(ev);
  }
  rows.push({
    time: tx.blockTime ? new Date(Number(tx.blockTime) * 1000).toISOString() : "?",
    slot: String(tx.slot),
    signature: String(s.signature),
    instruction: ix || "(none)",
    status: tx.meta?.err ? JSON.stringify(tx.meta.err, rep) : "ok",
    events: evs,
  });
}
rows.reverse();

for (const r of rows) {
  console.log(`${r.time}  slot ${r.slot}  ${r.instruction.padEnd(16)} ${r.status}`);
  console.log(`    ${r.signature}`);
  for (const e of r.events) console.log(`    EVENT ${e.name} ${JSON.stringify(e.fields)}`);
}
console.log(`\n${rows.length} transactions, ${rows.reduce((a, r) => a + r.events.length, 0)} decoded events`);
if (OUT) {
  writeFileSync(OUT, JSON.stringify(rows, rep, 2));
  console.log("wrote " + OUT);
}
