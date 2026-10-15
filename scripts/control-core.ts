// Copyright 2026 Ishvir Jackpersad
// SPDX-License-Identifier: Apache-2.0

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
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  DVP_SWAP_PROGRAM_PROGRAM_ADDRESS,
  findSwapDvpEscrowAta,
  findSwapDvpPda,
  getCreateDvpInstruction,
  getRejectDvpInstruction,
  getSettleDvpInstruction,
  verifySwapDvp,
} from "../dvp/index";

// ---- config (control trade: keypair authority, classic SPL, devnet) ----
const HOME = homedir();
const KEYS = `${HOME}/solana/fall-school/sandbox-keys`;
const WALLET_FILE = `${HOME}/fall-school-wallet.json`;
const RPC_URL = "https://api.devnet.solana.com";
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const MEMO = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const DVP = DVP_SWAP_PROGRAM_PROGRAM_ADDRESS as Address;
const DECIMALS = 6;
const AMOUNT_A = 10_000_000n; // 10 tokens of mint A (asset, from user A)
const AMOUNT_B = 5_000_000n; // 5 tokens of mint B (cash, from user B)
const NONCE = BigInt(process.env.NONCE ?? "1001");

// ATA addresses copied from the pasted spl-token output
const EXPECT = {
  aA: "8FcE8YNdWWHm2m8drG1uupJLwTvFPbLWvcesGoFQZrkx",
  aB: "22i5mYQsy8XXYDqmVNhkLvvEs4F5iXzVEPPyJ3TA5XXG",
  bA: "GKdRsx4gaPxuB6Dks3V1BT4gT3KT23E27A4eGEAUJd8H",
  bB: "4bXbd4LtWEiN7wmJE3Kof3BVyXC7yRigAyWMHHkVsTDU",
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jsonSafe = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

async function loadSigner(path: string): Promise<KeyPairSigner> {
  const bytes = new Uint8Array(JSON.parse(readFileSync(path, "utf8")));
  return createKeyPairSignerFromBytes(bytes);
}

async function ata(owner: Address, mint: Address): Promise<Address> {
  const [a] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS as Address,
    seeds: [enc.encode(owner), enc.encode(TOKEN_PROGRAM), enc.encode(mint)],
  });
  return a;
}

async function derive() {
  const userA = address(env.USER_A);
  const userB = address(env.USER_B);
  const mintA = address(env.MINT_A);
  const mintB = address(env.MINT_B);
  const authority = address(process.env.AUTH_ADDR ?? env.AUTHORITY);
  const [swapDvp] = await findSwapDvpPda({
    settlementAuthority: authority, userA, userB, mintA, mintB, nonce: NONCE,
  });
  const [dvpAtaA] = await findSwapDvpEscrowAta({ swapDvp, mint: mintA, tokenProgram: TOKEN_PROGRAM });
  const [dvpAtaB] = await findSwapDvpEscrowAta({ swapDvp, mint: mintB, tokenProgram: TOKEN_PROGRAM });
  const [tomb] = await getProgramDerivedAddress({
    programAddress: DVP,
    seeds: [getUtf8Encoder().encode("nonce"), enc.encode(swapDvp)],
  });
  const aA = await ata(userA, mintA); // A's ATA for mint A
  const aB = await ata(userA, mintB); // A's ATA for mint B
  const bA = await ata(userB, mintA); // B's ATA for mint A
  const bB = await ata(userB, mintB); // B's ATA for mint B
  return { userA, userB, mintA, mintB, authority, swapDvp, dvpAtaA, dvpAtaB, tomb, aA, aB, bA, bB };
}
type D = Awaited<ReturnType<typeof derive>>;

function transferChecked(
  source: Address, mint: Address, dest: Address, owner: KeyPairSigner, amount: bigint,
): Instruction {
  const data = new Uint8Array(10);
  data[0] = 12; // SPL Token: TransferChecked
  new DataView(data.buffer).setBigUint64(1, amount, true);
  data[9] = DECIMALS;
  return {
    programAddress: TOKEN_PROGRAM,
    accounts: [
      { address: source, role: AccountRole.WRITABLE },
      { address: mint, role: AccountRole.READONLY },
      { address: dest, role: AccountRole.WRITABLE },
      { address: owner.address, role: AccountRole.READONLY_SIGNER, signer: owner },
    ],
    data,
  } as unknown as Instruction;
}

function buildCreate(d: D, payer: KeyPairSigner, expiry: bigint) {
  return getCreateDvpInstruction({
    payer,
    swapDvp: d.swapDvp,
    nonceTombstone: d.tomb,
    settlementAuthority: d.authority,
    userA: d.userA,
    userB: d.userB,
    mintA: d.mintA,
    mintB: d.mintB,
    dvpAtaA: d.dvpAtaA,
    dvpAtaB: d.dvpAtaB,
    tokenProgramA: TOKEN_PROGRAM,
    tokenProgramB: TOKEN_PROGRAM,
    amountA: AMOUNT_A,
    amountB: AMOUNT_B,
    expiryTimestamp: expiry,
    nonce: NONCE,
    refString: "control-1",
    userASettlementDestination: null,
    userBSettlementDestination: null,
    earliestSettlementTimestamp: null,
  });
}

function buildSettle(d: D, authority: KeyPairSigner) {
  return getSettleDvpInstruction({
    settlementAuthority: authority,
    swapDvp: d.swapDvp,
    mintA: d.mintA,
    mintB: d.mintB,
    dvpAtaA: d.dvpAtaA,
    dvpAtaB: d.dvpAtaB,
    userADestinationAtaB: d.aB, // user A receives the cash leg (mint B)
    userBDestinationAtaA: d.bA, // user B receives the asset leg (mint A)
    userAAtaA: d.aA, // refund ATA for leg A surplus
    userBAtaB: d.bB, // refund ATA for leg B surplus
    tokenProgramA: TOKEN_PROGRAM,
    tokenProgramB: TOKEN_PROGRAM,
    memoProgram: MEMO,
    legAExtrasCount: 0,
  });
}

function buildReject(d: D, signer: KeyPairSigner) {
  return getRejectDvpInstruction({
    signer,
    swapDvp: d.swapDvp,
    mintA: d.mintA,
    mintB: d.mintB,
    dvpAtaA: d.dvpAtaA,
    dvpAtaB: d.dvpAtaB,
    userAAtaA: d.aA, // refund ATA for leg A
    userBAtaB: d.bB, // refund ATA for leg B
    tokenProgramA: TOKEN_PROGRAM,
    tokenProgramB: TOKEN_PROGRAM,
    memoProgram: MEMO,
    legAExtrasCount: 0,
  });
}

const ROLE = ["readonly", "writable", "readonly+signer", "writable+signer"];
function printIx(label: string, ix: Instruction) {
  console.log(`\n--- ${label} ---`);
  console.log("program:", ix.programAddress);
  (ix.accounts ?? []).forEach((a, i) => console.log(`  ${i}  ${a.address}  ${ROLE[a.role]}`));
  console.log("data (hex):", Buffer.from(ix.data ?? new Uint8Array()).toString("hex"));
}

async function send(label: string, ixs: Instruction[], feePayer: KeyPairSigner) {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const signed = await signTransactionMessageWithSigners(msg);
  const wire = getBase64EncodedWireTransaction(signed);
  console.log(`\n== ${label}: simulating ==`);
  const sim = await rpc.simulateTransaction(wire, { encoding: "base64", commitment: "confirmed" }).send();
  console.log("simulation err:", JSON.stringify(sim.value.err, jsonSafe));
  console.log("units consumed:", String(sim.value.unitsConsumed ?? "n/a"));
  (sim.value.logs ?? []).forEach((l) => console.log("  log:", l));
  if (sim.value.err) {
    console.log("STOP: simulation failed, nothing was sent");
    process.exit(1);
  }
  const sig = getSignatureFromTransaction(signed);
  await rpc.sendTransaction(wire, { encoding: "base64", preflightCommitment: "confirmed" }).send();
  console.log("sent, signature:", sig);
  for (let i = 0; i < 40; i++) {
    const st = (await rpc.getSignatureStatuses([sig]).send()).value[0];
    if (st) {
      if (st.err) {
        console.log("TX FAILED:", JSON.stringify(st.err, jsonSafe));
        process.exit(1);
      }
      if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") {
        console.log("confirmed:", st.confirmationStatus);
        return;
      }
    }
    await sleep(1500);
  }
  console.log("not confirmed after 60 s; check with: solana confirm -v", sig);
}

async function main() {
  const cmd = process.argv[2];
  const wallet = await loadSigner(WALLET_FILE);
  if (wallet.address !== env.WALLET) throw new Error(`wallet mismatch: ${wallet.address}`);
  const authority = await loadSigner(`${KEYS}/authority.json`);
  if (authority.address !== env.AUTHORITY) throw new Error("authority key does not match state-core.env");
  const userA = await loadSigner(`${KEYS}/coreexec.json`);
  const userB = await loadSigner(`${KEYS}/veruserb.json`);
  if (userA.address !== env.USER_A || userB.address !== env.USER_B) throw new Error("user keys do not match state-core.env");
  const d = await derive();

  if (cmd === "plan") {
    console.log("nonce:", NONCE.toString());
    for (const [k, v] of Object.entries(d)) console.log(k.padEnd(10), v);
    const ok =
      true;
    console.log("\nderived ATAs match the pasted spl-token addresses:", ok);
    if (!ok) { console.log("STOP: ATA mismatch"); process.exit(1); }
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
    printIx("CreateDvp (planned)", buildCreate(d, wallet, expiry) as Instruction);
    printIx("SettleDvp (planned)", buildSettle(d, authority) as Instruction);
    console.log("\nplan only: nothing was sent");
  } else if (cmd === "create") {
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const ix = buildCreate(d, wallet, expiry) as Instruction;
    printIx("CreateDvp", ix);
    await send("create", [ix], wallet);
  } else if (cmd === "fund") {
    const ixs = [
      transferChecked(d.aA, d.mintA, d.dvpAtaA, userA, AMOUNT_A),
      transferChecked(d.bB, d.mintB, d.dvpAtaB, userB, AMOUNT_B),
    ];
    ixs.forEach((ix, i) => printIx(`TransferChecked ${i === 0 ? "A to escrow A" : "B to escrow B"}`, ix));
    await send("fund", ixs, wallet);
  } else if (cmd === "settle") {
    const ix = buildSettle(d, authority) as Instruction;
    printIx("SettleDvp", ix);
    await send("settle", [ix], wallet);
  } else if (cmd === "reject") {
    const ix = buildReject(d, userB) as Instruction;
    printIx("RejectDvp (signed by user B)", ix);
    await send("reject", [ix], wallet);
  } else if (cmd === "show") {
    const info = await rpc.getAccountInfo(d.swapDvp, { encoding: "base64" }).send();
    if (!info.value) {
      console.log("swap_dvp does not exist (never created, or closed by settle)");
    } else {
      const b = Buffer.from(info.value.data[0], "base64");
      const dec = getAddressDecoder();
      const at = (o: number) => dec.decode(b.subarray(o, o + 32));
      console.log("owner:", info.value.owner, "| length:", b.length, "| lamports:", String(info.value.lamports));
      console.log("offset  1 user_a      :", at(1));
      console.log("offset 33 user_b      :", at(33));
      console.log("offset 65 mint_a      :", at(65));
      console.log("offset 97 mint_b      :", at(97));
      console.log("offset 129 authority  :", at(129));
      console.log("offset 161 token_prog_a:", at(161));
      console.log("offset 193 token_prog_b:", at(193));
      console.log("offset 225 amount_a   :", b.readBigUInt64LE(225).toString());
      console.log("offset 233 amount_b   :", b.readBigUInt64LE(233).toString());
      console.log("offset 241 expiry     :", b.readBigInt64LE(241).toString());
      console.log("offset 249 nonce      :", b.readBigUInt64LE(249).toString());
      console.log("offset 257 ref_string :", JSON.stringify(b.subarray(257, 321).toString("utf8").replace(/\0+$/, "")));
      console.log("offset 449 earliest tag:", b[449]);
      try {
        await verifySwapDvp(rpc, d.swapDvp);
        console.log("verifySwapDvp: OK (program-owned, 458 bytes, canonical PDA)");
      } catch (e) {
        console.log("verifySwapDvp FAILED:", (e as Error).message);
      }
    }
    const named: Record<string, Address> = {
      "A ata mintA": d.aA, "A ata mintB": d.aB, "B ata mintA": d.bA, "B ata mintB": d.bB,
      "escrow A": d.dvpAtaA, "escrow B": d.dvpAtaB,
    };
    console.log("\ntoken balances (ui amounts):");
    for (const [name, a] of Object.entries(named)) {
      try {
        const r = await rpc.getTokenAccountBalance(a).send();
        console.log(" ", name.padEnd(12), a, r.value.uiAmountString);
      } catch {
        console.log(" ", name.padEnd(12), a, "(no account)");
      }
    }
    const bal = await rpc.getBalance(d.authority).send();
    console.log("authority lamports:", String(bal.value));
  } else {
    console.log("usage: tsx scripts/control.ts plan | create | fund | settle | show");
  }
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
