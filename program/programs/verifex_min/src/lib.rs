// Copyright 2026 Ishvir Jackpersad
// SPDX-License-Identifier: Apache-2.0
//
// VERIFEX (minimal): one on-chain check, then it issues a Referee credential as the issuer.
// Check: the presented agent program is immutable (its upgrade authority is None).
// This is a demonstration of the issuer-to-credential path, NOT a security guarantee: the program
// is not yet bound to the subject's identity. Unaudited. Devnet only.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

declare_id!("4GTqnRnN4ZDTzHf2EeqQW98RhDAtCkwG7vTgaPapR4Qs");

pub const REFEREE_PROGRAM_ID: Pubkey = pubkey!("EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe");
pub const LOADER_UPGRADEABLE: Pubkey = pubkey!("BPFLoaderUpgradeab1e11111111111111111111111");
pub const ISSUER_SEED: &[u8] = b"issuer";
pub const FLAG_ELIGIBLE: u8 = 1;
pub const CREDENTIAL_SECONDS: i64 = 7 * 24 * 60 * 60;
/// Anchor discriminator of referee_stub::issue_credential = sha256("global:issue_credential")[..8].
pub const ISSUE_CREDENTIAL_DISC: [u8; 8] = [255, 193, 171, 224, 68, 171, 194, 87];

fn tag(d: &[u8]) -> u32 {
    u32::from_le_bytes([d[0], d[1], d[2], d[3]])
}

#[program]
pub mod verifex_min {
    use super::*;

    /// Checks that the agent program is immutable, then issues a Referee credential to `subject`.
    pub fn verify_and_issue(ctx: Context<VerifyAndIssue>, subject: Pubkey) -> Result<()> {
        let prog = ctx.accounts.agent_program.to_account_info();
        let pd = ctx.accounts.agent_programdata.to_account_info();

        require!(
            prog.executable && *prog.owner == LOADER_UPGRADEABLE,
            VerifexError::NotAnUpgradeableLoaderProgram
        );
        {
            let d = prog.try_borrow_data()?;
            require!(d.len() >= 36 && tag(&d) == 2, VerifexError::BadProgramAccount);
            let pd_key = Pubkey::new_from_array(d[4..36].try_into().unwrap());
            require_keys_eq!(pd_key, *pd.key, VerifexError::BadProgramAccount);
        }
        require!(*pd.owner == LOADER_UPGRADEABLE, VerifexError::BadProgramAccount);
        {
            let d = pd.try_borrow_data()?;
            // ProgramData: u32 tag(3), u64 slot, Option<Pubkey> upgrade authority (1 byte + 32).
            require!(d.len() >= 45 && tag(&d) == 3, VerifexError::BadProgramAccount);
            require!(d[12] == 0, VerifexError::AgentNotImmutable);
        }

        let now = Clock::get()?.unix_timestamp;
        let expires_at = now + CREDENTIAL_SECONDS;

        let mut data = Vec::with_capacity(8 + 32 + 1 + 8);
        data.extend_from_slice(&ISSUE_CREDENTIAL_DISC);
        data.extend_from_slice(subject.as_ref());
        data.push(FLAG_ELIGIBLE);
        data.extend_from_slice(&expires_at.to_le_bytes());

        let payer = ctx.accounts.payer.to_account_info();
        let issuer = ctx.accounts.verifex_issuer.to_account_info();
        let config = ctx.accounts.config.to_account_info();
        let credential = ctx.accounts.credential.to_account_info();
        let sys = ctx.accounts.system_program.to_account_info();
        let referee = ctx.accounts.referee_program.to_account_info();

        let ix = Instruction {
            program_id: REFEREE_PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*payer.key, true),
                AccountMeta::new_readonly(*issuer.key, true),
                AccountMeta::new_readonly(*config.key, false),
                AccountMeta::new(*credential.key, false),
                AccountMeta::new_readonly(*sys.key, false),
            ],
            data,
        };
        let bump = ctx.bumps.verifex_issuer;
        let seeds: &[&[u8]] = &[ISSUER_SEED, &[bump]];
        msg!("verifex: agent program {} is immutable; issuing credential to {}", prog.key, subject);
        invoke_signed(&ix, &[payer, issuer, config, credential, sys, referee], &[seeds])?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct VerifyAndIssue<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: PDA that signs as Referee's issuer; derived from fixed seeds.
    #[account(seeds = [ISSUER_SEED], bump)]
    pub verifex_issuer: UncheckedAccount<'info>,
    /// CHECK: validated in the handler (executable, loader, programdata link).
    pub agent_program: UncheckedAccount<'info>,
    /// CHECK: validated in the handler.
    pub agent_programdata: UncheckedAccount<'info>,
    /// CHECK: Referee validates its own config.
    pub config: UncheckedAccount<'info>,
    /// CHECK: Referee creates and validates the credential PDA.
    #[account(mut)]
    pub credential: UncheckedAccount<'info>,
    /// CHECK: fixed address.
    #[account(address = REFEREE_PROGRAM_ID)]
    pub referee_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum VerifexError {
    #[msg("The agent program is not owned by the upgradeable loader")]
    NotAnUpgradeableLoaderProgram,
    #[msg("The agent program accounts are malformed or do not match")]
    BadProgramAccount,
    #[msg("The agent program is still upgradeable")]
    AgentNotImmutable,
}
