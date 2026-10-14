// Copyright 2026 Ishvir Jackpersad
// SPDX-License-Identifier: Apache-2.0
//
// keeper.ts: scans devnet for registered REFEREE trades and settles the ones that are ready.
// Anyone can run it with any funded key (settle needs no authority signature). Pays nothing for the work.
// Dry run by default (simulate only); SEND=1 sends. LOOP=<seconds> repeats until stopped.
// Env: WALLET (default sandbox-keys/keeper.json), SEND, LOOP, RPC_URL, IDL.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getAddressDecoder,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  getUtf8Encoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
} from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";

const HOME = homedir();
const envOr = (k: string, d: string) => (process.env[k] && process.env[k] !== "" ? (process.env[k] as string) : d);
const RPC_URL = envOr("RPC_URL", "https://api.devnet.solana.com");
const WALLET_FILE = envOr("WALLET", `${HOME}/solana/fall-school/sandbox-keys/keeper.json`);
const IDL_PATH = envOr("IDL", `${HOME}/solana/fall-school/referee_stub/target/idl/referee_stub.json`);
const SEND = process.env.SEND === "1";
const LOOP = Number(process.env.LOOP ?? "0");

const PROGRAM_ID = address("EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe");
const DVP = address("dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq");
const MEMO = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const TOKEN = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYS = address("11111111111111111111111111111111");
const TRADE_SIZE = 161n;

const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
const settleIx = idl.instructions.find((i: any) => i.name === "settle");
const tradeAcc = idl.accounts.find((a: any) => a.name === "Trade");
if (!settleIx || !tradeAcc) {
  console.error("STOPPED: the IDL has no settle instruction or Trade account");
  process.exit(1);
}
const SETTLE_DISC = Uint8Array.from(settleIx.discriminator);
const TRADE_DISC = Buffer.from(tradeAcc.discriminator);

const rpc: any = createSolanaRpc(RPC_URL);
const enc = getAddressEncoder();
const dec = getAddressDecoder();
const utf8 = getUtf8Encoder();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jsonSafe = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
const key = (b: Uint8Array, o: number): Address => dec.decode(b.subarray(o, o + 32));

async function retry(f: () => Promise<any>): Promise<any> {
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

async function acct(a: Address) {
  const r: any = await retry(() => rpc.getAccountInfo(a, { encoding: "base64", commitment: "confirmed" }).send());
  if (!r.value) return null;
  return { owner: String(r.value.owner), data: Buffer.from(r.value.data[0] as string, "base64") };
}
async function tokenAmount(a: Address): Promise<bigint> {
  try {
    const r: any = await retry(() => rpc.getTokenAccountBalance(a).send());
    return BigInt(r.value.amount);
  } catch {
    return 0n;
  }
}
type Seeds = Parameters<typeof getProgramDerivedAddress>[0]["seeds"];
async function pda(seeds: Seeds, program: Address = PROGRAM_ID): Promise<Address> {
  return (await getProgramDerivedAddress({ programAddress: program, seeds }))[0];
}
async function ata(owner: Address, mint: Address): Promise<Address> {
  return (await findAssociatedTokenPda({ owner, tokenProgram: TOKEN, mint }))[0];
}

const payer = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(WALLET_FILE, "utf8"))));
const AUTH = await pda([utf8.encode("authority")]);
const CONFIG = await pda([utf8.encode("config")]);
console.log(`keeper key ${payer.address} | mode ${SEND ? "SEND" : "dry run"} | authority PDA ${AUTH}`);

async function credOk(subject: Address, now: bigint): Promise<string | null> {
  const c = await pda([utf8.encode("cred"), enc.encode(subject)]);
  const a = await acct(c);
  if (!a) return `no credential for ${subject}`;
  if ((a.data[72] & 1) === 0) return `credential for ${subject} is not eligible (revoked)`;
  if (a.data.readBigInt64LE(73) <= now) return `credential for ${subject} has expired`;
  return null;
}

async function settleTrade(tradePda: Address, t: Buffer): Promise<string> {
  const swap = key(t, 8);
  const userA = key(t, 40);
  const userB = key(t, 72);
  const refund = key(t, 104);
  const amountA = t.readBigUInt64LE(136);
  const amountB = t.readBigUInt64LE(144);
  const now = BigInt(Math.floor(Date.now() / 1000));

  const rec = await acct(swap);
  if (!rec || rec.owner !== DVP) return "SKIP: DvP record is gone (settled or rejected); close_trade can reclaim the registration";
  if (rec.data.length !== 458) return `SKIP: record is ${rec.data.length} bytes`;
  if (rec.data.readBigInt64LE(241) <= now) return "SKIP: expired";
  const mintA = key(rec.data, 65);
  const mintB = key(rec.data, 97);
  if (key(rec.data, 161) !== TOKEN || key(rec.data, 193) !== TOKEN) return "SKIP: not classic SPL legs";
  for (const who of [userA, userB]) {
    const why = await credOk(who, now);
    if (why) return "SKIP: " + why;
  }
  const dvpAtaA = await ata(swap, mintA);
  const dvpAtaB = await ata(swap, mintB);
  if ((await tokenAmount(dvpAtaA)) < amountA) return "SKIP: asset leg not funded yet";
  if ((await tokenAmount(dvpAtaB)) < amountB) return "SKIP: cash leg not funded yet";

  const credA = await pda([utf8.encode("cred"), enc.encode(userA)]);
  const credB = await pda([utf8.encode("cred"), enc.encode(userB)]);
  const W = AccountRole.WRITABLE;
  const R = AccountRole.READONLY;
  const accs: [Address, AccountRole][] = [
    [AUTH, W], [CONFIG, R], [swap, W], [tradePda, W], [credA, R], [credB, R], [refund, W], [SYS, R],
    [mintA, R], [mintB, R], [dvpAtaA, W], [dvpAtaB, W],
    [await ata(userA, mintB), W], [await ata(userB, mintA), W], [await ata(userA, mintA), W], [await ata(userB, mintB), W],
    [TOKEN, R], [TOKEN, R], [MEMO, R], [DVP, R],
  ];
  const ix = {
    programAddress: PROGRAM_ID,
    accounts: accs.map(([a, role]) => ({ address: a, role })),
    data: SETTLE_DISC,
  } as unknown as Instruction;

  const { value: bh } = await retry(() => rpc.getLatestBlockhash().send());
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
    (m) => appendTransactionMessageInstructions([ix], m),
  );
  const signed = await signTransactionMessageWithSigners(msg);
  const wire = getBase64EncodedWireTransaction(signed);
  const sim: any = await retry(() => rpc.simulateTransaction(wire, { encoding: "base64", commitment: "confirmed" }).send());
  if (sim.value.err) {
    const log = (sim.value.logs ?? []).find((l: string) => l.includes("Error Code")) ?? "";
    return `SKIP: simulation failed ${JSON.stringify(sim.value.err, jsonSafe)} ${log}`;
  }
  if (!SEND) return `READY: simulation ok (${sim.value.unitsConsumed} units); set SEND=1 to settle`;
  const sig = getSignatureFromTransaction(signed);
  await retry(() => rpc.sendTransaction(wire, { encoding: "base64" }).send());
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const st: any = (await retry(() => rpc.getSignatureStatuses([sig]).send())).value[0];
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      return st.err
        ? `FAILED on chain: ${JSON.stringify(st.err, jsonSafe)} (${sig})`
        : `SETTLED ${st.confirmationStatus}: ${sig}\n      verify with: solana confirm -v ${sig} --url devnet`;
    }
  }
  return `UNCONFIRMED after 60 s: ${sig}`;
}

async function pass() {
  const list: any[] = await retry(() =>
    rpc.getProgramAccounts(PROGRAM_ID, { encoding: "base64", filters: [{ dataSize: TRADE_SIZE }] }).send(),
  );
  let found = 0;
  for (const item of list) {
    const data = Buffer.from(item.account.data[0] as string, "base64");
    if (data.length !== Number(TRADE_SIZE) || !data.subarray(0, 8).equals(TRADE_DISC)) continue;
    found++;
    const tradePda = address(String(item.pubkey));
    console.log(`\nregistered trade ${tradePda}`);
    console.log(`   DvP record ${key(data, 8)}`);
    console.log("   " + (await settleTrade(tradePda, data)));
  }
  console.log(`\n${new Date().toISOString()}  ${found} registered trade(s) examined`);
}

do {
  await pass();
  if (!LOOP) break;
  await sleep(LOOP * 1000);
} while (true);
