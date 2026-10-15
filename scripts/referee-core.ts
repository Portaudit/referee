// Copyright 2026 Ishvir Jackpersad
// SPDX-License-Identifier: Apache-2.0
//
// referee.ts: devnet client for the REFEREE program (config, credentials, trade registry, gated settle).
// Commands: status | init-config | issue | set-credential | register | settle
// Dry run by default: it simulates and prints. SEND=1 sends after a clean simulation.
// FORCE=1 with SEND=1 sends even if the simulation failed (preflight skipped), so a refusal lands on chain.
// Env: NONCE, SUBJECT (a | b | address), DAYS, FLAGS, REFUND_TO, SEND, FORCE, RPC_URL, WALLET, IDL.

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
  type KeyPairSigner,
} from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";

function die(msg: string): never {
  console.error("STOPPED: " + msg);
  process.exit(1);
}
const j = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const HOME = homedir();
const KEYS = `${HOME}/solana/fall-school/sandbox-keys`;
const envOr = (k: string, d: string) =>
  process.env[k] && process.env[k] !== "" ? (process.env[k] as string) : d;
const RPC_URL = envOr("RPC_URL", "https://api.devnet.solana.com");
const WALLET_FILE = envOr("WALLET", `${HOME}/fall-school-wallet.json`);
const IDL_PATH = envOr(
  "IDL",
  `${HOME}/solana/fall-school/referee_stub/target/idl/referee_stub.json`,
);
const SEND = process.env.SEND === "1";
const FORCE = process.env.FORCE === "1";

const PROGRAM_ID = address("EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe");
const DVP = address("dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq");
const MEMO = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const TOKEN = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYS = address("11111111111111111111111111111111");
const EXPECTED_AUTH = "GE7FbxTFG1ExcvCCuqScLxto65uw5rHqQFpwrH3cDyew";

const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
if (idl.instructions.some((i: any) => i.name === "settle_stub")) die("the IDL is the old stub's");
const disc = (name: string): number[] => {
  const i = idl.instructions.find((x: any) => x.name === name);
  if (!i) die(`instruction ${name} is not in the IDL`);
  return i.discriminator;
};

const env: Record<string, string> = Object.fromEntries(
  readFileSync(`${KEYS}/state-core.env`, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const rpc = createSolanaRpc(RPC_URL);
const enc = getAddressEncoder();
const dec = getAddressDecoder();
const utf8 = getUtf8Encoder();
const key = (b: Uint8Array, o: number): Address => dec.decode(b.subarray(o, o + 32));
const u64 = (n: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};
const i64 = (n: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, n, true);
  return b;
};
const cat = (...parts: ArrayLike<number>[]) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const nowSec = () => BigInt(Math.floor(Date.now() / 1000));

type Seeds = Parameters<typeof getProgramDerivedAddress>[0]["seeds"];
async function pda(seeds: Seeds, program: Address = PROGRAM_ID): Promise<Address> {
  return (await getProgramDerivedAddress({ programAddress: program, seeds }))[0];
}
const AUTH = await pda([utf8.encode("authority")]);
const CONFIG = await pda([utf8.encode("config")]);
if (AUTH !== EXPECTED_AUTH) die(`authority PDA ${AUTH} differs from ${EXPECTED_AUTH}`);

async function loadSigner(path: string): Promise<KeyPairSigner> {
  return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

async function acct(a: Address) {
  const r = await rpc.getAccountInfo(a, { encoding: "base64", commitment: "confirmed" }).send();
  if (!r.value) return null;
  return {
    owner: r.value.owner as string,
    lamports: r.value.lamports,
    data: Buffer.from(r.value.data[0] as string, "base64"),
  };
}

type Acc = [Address, AccountRole] | [Address, AccountRole, KeyPairSigner];
function ix(name: string, accs: Acc[], args: ArrayLike<number> = []): Instruction {
  return {
    programAddress: PROGRAM_ID,
    accounts: accs.map((a) =>
      a[2] ? { address: a[0], role: a[1], signer: a[2] } : { address: a[0], role: a[1] },
    ),
    data: cat(disc(name), args),
  } as unknown as Instruction;
}
const ROLE = ["readonly", "writable", "readonly+signer", "writable+signer"];
function show(label: string, i: Instruction, names: string[] = []) {
  console.log(`\n--- ${label} ---`);
  (i.accounts ?? []).forEach((a, n) =>
    console.log(`  ${n} ${names[n] ?? ""} ${a.address} ${ROLE[a.role]}`),
  );
  console.log("data (hex):", Buffer.from(i.data ?? new Uint8Array()).toString("hex"));
}

async function run(label: string, ixs: Instruction[], payer: KeyPairSigner) {
  const { value: bh } = await rpc.getLatestBlockhash().send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const signed = await signTransactionMessageWithSigners(msg);
  const wire = getBase64EncodedWireTransaction(signed);
  console.log(`\n== ${label}: simulating ==`);
  const sim = await rpc
    .simulateTransaction(wire, { encoding: "base64", commitment: "confirmed" })
    .send();
  console.log("simulation err:", j(sim.value.err));
  console.log("units consumed:", String(sim.value.unitsConsumed ?? "n/a"));
  (sim.value.logs ?? []).forEach((l) => console.log("  log:", l));
  const failed = !!sim.value.err;
  if (!SEND) {
    console.log(failed ? "dry run: simulation FAILED, nothing sent" : "dry run ok. Set SEND=1 to send.");
    process.exit(failed ? 3 : 0);
  }
  if (failed && !FORCE) {
    console.log("simulation failed: not sending (FORCE=1 would send it anyway).");
    process.exit(3);
  }
  const sig = getSignatureFromTransaction(signed);
  await rpc.sendTransaction(wire, { encoding: "base64", skipPreflight: failed }).send();
  console.log("sent: " + sig);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const st = (await rpc.getSignatureStatuses([sig]).send()).value[0];
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      console.log("status:", j({ confirmationStatus: st.confirmationStatus, err: st.err }));
      console.log(`verify with: solana confirm -v ${sig} --url devnet`);
      process.exit(st.err ? 4 : 0);
    }
  }
  console.log("not confirmed after 60 s; check with: solana confirm -v " + sig);
  process.exit(5);
}

function nonceEnv(): bigint {
  const n = process.env.NONCE ?? "";
  if (!/^[0-9]+$/.test(n)) die("set NONCE (digits only)");
  return BigInt(n);
}
function subjectEnv(): Address {
  const s = process.env.SUBJECT ?? "";
  if (s === "a") return address(env.USER_A);
  if (s === "b") return address(env.USER_B);
  if (!s) die("set SUBJECT to a, b or an address");
  return address(s);
}

async function derive(n: bigint) {
  const userA = address(env.USER_A);
  const userB = address(env.USER_B);
  const mintA = address(env.MINT_A);
  const mintB = address(env.MINT_B);
  const swap = await pda(
    [utf8.encode("dvp"), enc.encode(AUTH), enc.encode(userA), enc.encode(userB),
     enc.encode(mintA), enc.encode(mintB), u64(n)],
    DVP,
  );
  const trade = await pda([utf8.encode("trade"), enc.encode(swap)]);
  const ata = async (owner: Address, mint: Address) =>
    (await findAssociatedTokenPda({ owner, tokenProgram: TOKEN, mint }))[0];
  return {
    userA, userB, mintA, mintB, swap, trade,
    dvpAtaA: await ata(swap, mintA),
    dvpAtaB: await ata(swap, mintB),
    aA: await ata(userA, mintA),
    aB: await ata(userA, mintB),
    bA: await ata(userB, mintA),
    bB: await ata(userB, mintB),
    credA: await pda([utf8.encode("cred"), enc.encode(userA)]),
    credB: await pda([utf8.encode("cred"), enc.encode(userB)]),
  };
}

async function main() {
  const cmd = process.argv[2] ?? "";
  const wallet = await loadSigner(WALLET_FILE);
  const R = AccountRole.READONLY;
  const W = AccountRole.WRITABLE;
  const WS = AccountRole.WRITABLE_SIGNER;
  const RS = AccountRole.READONLY_SIGNER;

  if (cmd === "status") {
    const prog = await acct(PROGRAM_ID);
    console.log("program:", prog ? `exists, owner ${prog.owner}` : "MISSING");
    console.log("authority PDA:", AUTH, "lamports", String((await rpc.getBalance(AUTH).send()).value));
    const cfg = await acct(CONFIG);
    console.log(
      cfg
        ? `config ${CONFIG}: ${cfg.data.length} bytes, owner ${cfg.owner}, admin ${key(cfg.data, 8)}, issuer ${key(cfg.data, 40)}`
        : `config ${CONFIG}: not created yet`,
    );
    for (const [label, who] of [["A", env.USER_A], ["B", env.USER_B]] as const) {
      const c = await pda([utf8.encode("cred"), enc.encode(address(who))]);
      const a = await acct(c);
      console.log(
        a
          ? `credential ${label} ${c}: flags ${a.data[72]} expires_at ${a.data.readBigInt64LE(73)}`
          : `credential ${label} ${c}: none`,
      );
    }
    if (process.env.NONCE) {
      const d = await derive(nonceEnv());
      const rec = await acct(d.swap);
      const tr = await acct(d.trade);
      console.log(`DvP record ${d.swap}: ${rec ? `exists (${rec.data.length} bytes)` : "none"}`);
      console.log(`trade registration ${d.trade}: ${tr ? "exists" : "none"}`);
    }
  } else if (cmd === "init-config") {
    const issuer = await loadSigner(`${KEYS}/issuer.json`);
    const i = ix("init_config", [[wallet.address, WS, wallet], [CONFIG, W], [SYS, R]], enc.encode(issuer.address));
    show("init_config (issuer " + issuer.address + ")", i, ["admin", "config", "system_program"]);
    await run("init-config", [i], wallet);
  } else if (cmd === "issue") {
    const issuer = await loadSigner(`${KEYS}/issuer.json`);
    const subject = subjectEnv();
    const cred = await pda([utf8.encode("cred"), enc.encode(subject)]);
    const exp = nowSec() + BigInt(envOr("DAYS", "30")) * 86400n;
    const i = ix(
      "issue_credential",
      [[wallet.address, WS, wallet], [issuer.address, RS, issuer], [CONFIG, R], [cred, W], [SYS, R]],
      cat(enc.encode(subject), Uint8Array.of(1), i64(exp)),
    );
    show(`issue_credential to ${subject}, expires ${exp}`, i, ["payer", "issuer", "config", "credential", "system_program"]);
    await run("issue", [i], wallet);
  } else if (cmd === "set-credential") {
    const issuer = await loadSigner(`${KEYS}/issuer.json`);
    const subject = subjectEnv();
    const cred = await pda([utf8.encode("cred"), enc.encode(subject)]);
    const flags = Number(envOr("FLAGS", "0"));
    const exp = nowSec() + BigInt(envOr("DAYS", "30")) * 86400n;
    const i = ix(
      "set_credential",
      [[issuer.address, RS, issuer], [CONFIG, R], [cred, W]],
      cat(Uint8Array.of(flags), i64(exp)),
    );
    show(`set_credential ${subject} flags ${flags}`, i, ["issuer", "config", "credential"]);
    await run("set-credential", [i], wallet);
  } else if (cmd === "register") {
    const n = nonceEnv();
    if (SEND && n < 1005n) die("SEND requires NONCE >= 1005 (1001 to 1004 are used)");
    const d = await derive(n);
    const signerA = await loadSigner(`${KEYS}/coreexec.json`);
    const signerB = await loadSigner(`${KEYS}/veruserb.json`);
    if (signerA.address !== d.userA || signerB.address !== d.userB) die("user key files do not match state-core.env");
    const rec = await acct(d.swap);
    if (!rec) die(`no DvP record for nonce ${n} at ${d.swap}`);
    if (rec.owner !== DVP) die("record is not owned by DvP");
    if (rec.data.length !== 458) die(`record is ${rec.data.length} bytes`);
    if (key(rec.data, 129) !== AUTH) die("record authority is not the referee PDA");
    const amountA = rec.data.readBigUInt64LE(225);
    const amountB = rec.data.readBigUInt64LE(233);
    const refund = address(envOr("REFUND_TO", wallet.address));
    console.log(`record amounts ${amountA} / ${amountB}, refund_to ${refund}`);
    const i = ix(
      "register_trade",
      [[wallet.address, WS, wallet], [d.userA, RS, signerA], [d.userB, RS, signerB],
       [d.swap, R], [AUTH, R], [d.trade, W], [SYS, R]],
      cat(u64(amountA), u64(amountB), enc.encode(refund)),
    );
    show("register_trade", i, ["payer", "user_a", "user_b", "swap_dvp", "authority_pda", "trade", "system_program"]);
    await run("register", [i], wallet);
  } else if (cmd === "settle") {
    const n = nonceEnv();
    if (SEND && n < 1005n) die("SEND requires NONCE >= 1005 (1001 to 1004 are used)");
    const d = await derive(n);
    const tr = await acct(d.trade);
    const refund = tr ? key(tr.data, 104) : address(envOr("REFUND_TO", wallet.address));
    console.log(`trade registration: ${tr ? "exists" : "NONE (an unregistered trade is expected to be refused)"}`);
    const i = ix("settle", [
      [AUTH, W], [CONFIG, R], [d.swap, W], [d.trade, W], [d.credA, R], [d.credB, R], [refund, W], [SYS, R],
      [d.mintA, R], [d.mintB, R], [d.dvpAtaA, W], [d.dvpAtaB, W],
      [d.aB, W], [d.bA, W], [d.aA, W], [d.bB, W],
      [TOKEN, R], [TOKEN, R], [MEMO, R], [DVP, R],
    ]);
    show("settle", i, ["authority_pda", "config", "swap_dvp", "trade", "credential_a", "credential_b", "refund_to", "system_program",
      "mint_a", "mint_b", "dvp_ata_a", "dvp_ata_b", "user_a_destination_ata_b", "user_b_destination_ata_a",
      "user_a_ata_a", "user_b_ata_b", "token_program_a", "token_program_b", "memo_program", "dvp_program"]);
    await run("settle", [i], wallet);
  } else if (cmd === "close-trade") {
    const n = nonceEnv();
    const d = await derive(n);
    const tr = await acct(d.trade);
    if (!tr) die(`no trade registration at ${d.trade}`);
    const refund = key(tr.data, 104);
    const i = ix("close_trade", [[d.swap, R], [d.trade, W], [refund, W]]);
    show("close_trade", i, ["swap_dvp", "trade", "refund_to"]);
    await run("close-trade", [i], wallet);
  } else {
    console.log("usage: tsx scripts/referee.ts status | init-config | issue | set-credential | register | settle | close-trade");
  }
}

main().catch((e) => {
  console.error("ERROR: " + (e instanceof Error ? e.message : e));
  process.exit(1);
});
