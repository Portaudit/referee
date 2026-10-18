#!/usr/bin/env python3
"""Compares the DvP record offsets that Referee reads with the field order in DvP's serializer."""
import os, re, sys
home = os.path.expanduser("~/solana/fall-school")
dvp = sys.argv[1] if len(sys.argv) > 1 else home + "/evidence/dvp-src/program/src/state/swap_dvp.rs"
lib = sys.argv[2] if len(sys.argv) > 2 else home + "/referee/program/programs/referee_stub/src/lib.rs"
src = open(dvp, encoding="utf-8").read()
start = src.index("pub fn to_bytes")
end = src.index("match self.earliest_settlement_timestamp", start)
ref_len = int(re.search(r"pub ref_string:\s*\[u8;\s*(\d+)\]", src).group(1))
pats = ((r"data\.push\(self\.(\w+)\)", 1),
        (r"extend_from_slice\(self\.(\w+)\.as_ref\(\)\)", 32),
        (r"extend_from_slice\(&self\.(\w+)\.to_le_bytes\(\)\)", 8),
        (r"extend_from_slice\(&self\.(\w+)\)", ref_len))
off, fields = 0, {}
for line in src[start:end].splitlines():
    for pat, width in pats:
        m = re.search(pat, line)
        if m:
            fields[m.group(1)] = off
            off += width
            break
fields["earliest_tag"] = off
total = off + 1 + 8
lsrc = open(lib, encoding="utf-8").read()
consts = {m.group(1): int(m.group(2)) for m in re.finditer(r"const (OFF_\w+): usize = (\d+);", lsrc)}
rec_len = int(re.search(r"const DVP_RECORD_LEN: usize = (\d+);", lsrc).group(1))
M = {"OFF_USER_A": "user_a", "OFF_USER_B": "user_b", "OFF_AUTHORITY": "settlement_authority",
     "OFF_TOKEN_PROGRAM_A": "token_program_a", "OFF_TOKEN_PROGRAM_B": "token_program_b",
     "OFF_AMOUNT_A": "amount_a", "OFF_AMOUNT_B": "amount_b", "OFF_EXPIRY": "expiry_timestamp",
     "OFF_DEST_A": "user_a_settlement_destination", "OFF_DEST_B": "user_b_settlement_destination",
     "OFF_EARLIEST_TAG": "earliest_tag"}
bad = 0
for k, f in M.items():
    ok = consts.get(k) is not None and consts.get(k) == fields.get(f)
    bad += not ok
    print(("ok  " if ok else "BAD ") + f"{k:20} referee {consts.get(k)}  dvp {f} {fields.get(f)}")
extra = sorted(set(consts) - set(M))
if extra:
    print("constants with no mapping:", extra)
    bad += 1
ok = total == rec_len
bad += not ok
print(("ok  " if ok else "BAD ") + f"record length: referee {rec_len}  dvp serializer {total}")
print("fields Referee does not read:", {k: v for k, v in fields.items() if k not in M.values()})
print("ALL MATCH" if bad == 0 else f"MISMATCH: {bad} problem(s)")
sys.exit(1 if bad else 0)
