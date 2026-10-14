import * as dvp from "../dvp/index";

const names = Object.keys(dvp).filter((k) =>
  /(Instruction|Pda|Ata|verify|ADDRESS)/i.test(k) && !/Decoder|Encoder|Codec/.test(k)
);
console.log("program address:", (dvp as any).DVP_SWAP_PROGRAM_PROGRAM_ADDRESS);
console.log("expected       : dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq");
console.log("exports:\n  " + names.sort().join("\n  "));
