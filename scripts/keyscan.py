# Usage: python3 scripts/keyscan.py --git   (scans git history for key material)
import re, sys, hashlib, subprocess
A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58(s):
    n = 0
    for ch in s: n = n*58 + A.index(ch)
    b = n.to_bytes((n.bit_length()+7)//8, 'big')
    return b'\x00'*(len(s)-len(s.lstrip('1'))) + b
p = 2**255-19; d = -121665*pow(121666, -1, p) % p
def add(P, Q):
    x1, y1 = P; x2, y2 = Q
    return ((x1*y2+x2*y1)*pow(1+d*x1*x2*y1*y2, -1, p) % p, (y1*y2+x1*x2)*pow(1-d*x1*x2*y1*y2, -1, p) % p)
def mul(k, P):
    R = (0, 1)
    while k:
        if k & 1: R = add(R, P)
        P = add(P, P); k >>= 1
    return R
By = 4*pow(5, -1, p) % p
def rx(y):
    u = (y*y-1)*pow(d*y*y+1, -1, p) % p; x = pow(u, (p+3)//8, p)
    if (x*x-u) % p: x = x*pow(2, (p-1)//4, p) % p
    return x if x % 2 == 0 else p-x
B = (rx(By), By)
def pub(seed):
    h = bytearray(hashlib.sha512(seed).digest()[:32]); h[0] &= 248; h[31] &= 127; h[31] |= 64
    x, y = mul(int.from_bytes(h, 'little'), B)
    return (y | ((x & 1) << 255)).to_bytes(32, 'little')
if sys.argv[1:] == ['--git']:
    txt = subprocess.run(['git', 'log', '-p', '--all', '--no-color'], capture_output=True, text=True, errors='ignore').stdout
    files = subprocess.run(['git', 'ls-files'], capture_output=True, text=True).stdout.split()
else:
    txt = ''.join(open(f, errors='ignore').read() for f in sys.argv[1:]); files = []
c = set(re.findall(r'(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{86,90}(?![1-9A-HJ-NP-Za-km-z])', txt))
kp = 0
for s in c:
    try: b = b58(s)
    except Exception: continue
    if len(b) == 64 and pub(b[:32]) == b[32:]: kp += 1
print("bytes scanned:", len(txt))
print("base58 64-byte candidates:", len(c), "| valid keypairs:", kp)
print("64-number arrays:", len(re.findall(r'\[\s*(?:\d{1,3}\s*,\s*){62,}\d{1,3}\s*\]', txt)))
print("hex128 strings:", len(re.findall(r'(?<![0-9a-fA-F])[0-9a-fA-F]{128}(?![0-9a-fA-F])', txt)))
print("private-key blocks:", len(re.findall(r'BEGIN [A-Z ]*PRIVATE KEY', txt)))
print("token-like strings:", len(re.findall(r'(ghp_|gho_|github_pat_|sk-or-|sk-ant-|api-key=)[A-Za-z0-9_-]{12,}', txt)))
print("keypair-like tracked filenames:", [f for f in files if re.search(r'(?i)keypair|wallet|id\.json|\.env$|coreexec', f)])
