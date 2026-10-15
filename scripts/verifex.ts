// Copyright 2026 Ishvir Jackpersad
// SPDX-License-Identifier: Apache-2.0
//
// verifex.ts: devnet client for the minimal Verifex program and the Referee issuer switch.
// Commands: status | set-issuer | verify   (dry run by default; SEND=1 sends; FORCE=1 sends a refusal).
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
  readFileSync(`${KEYS}/state-vx.env`, "utf8")
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

function subjectEnv(): Address {
  const s = process.env.SUBJECT ?? "";
  if (s === "c") return address(env.USER_A);
  if (s === "d") return address(env.USER_B);
  if (!s) die("set SUBJECT to c, d or an address");
  return address(s);
}

const VERIFEX = address("4GTqnRnN4ZDTzHf2EeqQW98RhDAtCkwG7vTgaPapR4Qs");
const VX_IDL = envOr("VX_IDL", `${HOME}/solana/fall-school/verifex_min/target/idl/verifex_min.json`);
const vxIdl = JSON.parse(readFileSync(VX_IDL, "utf8"));
const AGENTS: Record<string, string> = {
  token: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // devnet shows Authority: none (immutable)
  token2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // devnet shows an upgrade authority
};
const ISSUER_PDA = await pda([utf8.encode("issuer")], VERIFEX);

async function main() {
  const cmd = process.argv[2] ?? "";
  const wallet = await loadSigner(WALLET_FILE);
  const R = AccountRole.READONLY;
  const W = AccountRole.WRITABLE;
  const WS = AccountRole.WRITABLE_SIGNER;
  const RS = AccountRole.READONLY_SIGNER;

  if (cmd === "status") {
    const vx = await acct(VERIFEX);
    console.log("verifex program:", vx ? `exists, owner ${vx.owner}` : "MISSING");
    console.log("verifex issuer PDA:", ISSUER_PDA);
    const demo = await loadSigner(`${KEYS}/issuer.json`);
    const cfg = await acct(CONFIG);
    const cur = cfg ? key(cfg.data, 40) : null;
    console.log("referee config issuer:", cur, cur === ISSUER_PDA ? "(= Verifex PDA)" : cur === demo.address ? "(= demo issuer key)" : "(other)");
    for (const [label, who] of [["C", env.USER_A], ["D", env.USER_B]] as const) {
      const c = await pda([utf8.encode("cred"), enc.encode(address(who))]);
      const a = await acct(c);
      console.log(
        a
          ? `credential ${label} ${c}: issuer ${key(a.data, 40)} flags ${a.data[72]} expires_at ${a.data.readBigInt64LE(73)}`
          : `credential ${label} (${who}) ${c}: none`,
      );
    }
  } else if (cmd === "set-issuer") {
    const which = process.env.ISSUER ?? "";
    if (which !== "verifex" && which !== "demo") die("set ISSUER to verifex or demo");
    const target = which === "verifex" ? ISSUER_PDA : (await loadSigner(`${KEYS}/issuer.json`)).address;
    const i = ix("set_issuer", [[wallet.address, RS, wallet], [CONFIG, W]], enc.encode(target));
    show(`set_issuer -> ${which} (${target})`, i, ["admin", "config"]);
    await run("set-issuer", [i], wallet);
  } else if (cmd === "verify") {
    const subject = subjectEnv();
    const a = process.env.AGENT ?? "";
    const agent = address(AGENTS[a] ?? a);
    if (!a) die("set AGENT to token, token2022 or a program address");
    const prog = await acct(agent);
    if (!prog) die(`no account at ${agent}`);
    const programdata = key(prog.data, 4);
    const cred = await pda([utf8.encode("cred"), enc.encode(subject)]);
    const d = vxIdl.instructions.find((x: any) => x.name === "verify_and_issue");
    if (!d) die("verify_and_issue is not in the Verifex IDL");
    const accs: [Address, AccountRole][] = [
      [wallet.address, WS], [ISSUER_PDA, R], [agent, R], [programdata, R],
      [CONFIG, R], [cred, W], [PROGRAM_ID, R], [SYS, R],
    ];
    const i = {
      programAddress: VERIFEX,
      accounts: accs.map(([address, role]) =>
        address === wallet.address ? { address, role, signer: wallet } : { address, role }),
      data: cat(d.discriminator, enc.encode(subject)),
    } as unknown as Instruction;
    show(`verify_and_issue subject ${subject}, agent program ${agent}`, i,
      ["payer", "verifex_issuer", "agent_program", "agent_programdata", "config", "credential", "referee_program", "system_program"]);
    await run("verify", [i], wallet);
  } else {
    console.log("usage: tsx scripts/verifex.ts status | set-issuer | verify");
  }
}

main().catch((e) => {
  console.error("ERROR: " + (e instanceof Error ? e.message : e));
  process.exit(1);
});
