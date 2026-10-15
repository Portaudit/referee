// Copyright 2026 Ishvir Jackpersad
// SPDX-License-Identifier: Apache-2.0
//
// VERIFEX (minimal), two instructions, each one on-chain check and then a Referee credential:
//  1. verify_and_issue: the presented agent program is immutable (upgrade authority None).
//  2. verify_outcome_and_issue ("Verifex Core"): a TrustRail Core commitment is Passed and its
//     executor_agent is the subject, which binds the credential to an agent with a recorded outcome.
// Demonstration of the issuer-to-credential path, NOT a security guarantee. TrustRail's Passed is a
// weak gate (output balance >= minimum; a donation to the output account can satisfy it) and the
// swap behind it is a disclosed 1:1 stand-in. Unaudited. Devnet only.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

declare_id!("4GTqnRnN4ZDTzHf2EeqQW98RhDAtCkwG7vTgaPapR4Qs");

pub const REFEREE_PROGRAM_ID: Pubkey = pubkey!("EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe");
pub const TRUSTRAIL_CORE_PROGRAM_ID: Pubkey = pubkey!("58t4gi88MNSURkwN6GuGugmXWPFqAT6s9pB56Srx4Bez");
pub const LOADER_UPGRADEABLE: Pubkey = pubkey!("BPFLoaderUpgradeab1e11111111111111111111111");
pub const ISSUER_SEED: &[u8] = b"issuer";
pub const COMMITMENT_SEED: &[u8] = b"commitment";
pub const STATUS_PASSED: u8 = 1;
pub const FLAG_ELIGIBLE: u8 = 1;
pub const CREDENTIAL_SECONDS: i64 = 7 * 24 * 60 * 60;
/// Anchor discriminator of referee_stub::issue_credential = sha256("global:issue_credential")[..8].
pub const ISSUE_CREDENTIAL_DISC: [u8; 8] = [255, 193, 171, 224, 68, 171, 194, 87];

fn tag(d: &[u8]) -> u32 {
    u32::from_le_bytes([d[0], d[1], d[2], d[3]])
}

/// Reads a TrustRail commitment account (Borsh, sequential): 8-byte discriminator, task_id,
/// payer, executor_agent, input_token, output_token, input_amount, min_output_amount,
/// deadline_slot, Option<Pubkey> external_verdict, Option<[u8;64]> proof_tx, Option<u64> proof_slot,
/// bool verified, u8 status. Returns (task_id, executor_agent, verified, status).
fn parse_commitment(d: &[u8]) -> Option<([u8; 32], Pubkey, bool, u8)> {
    let mut p = 8usize;
    let task_id: [u8; 32] = d.get(p..p + 32)?.try_into().ok()?;
    p += 32;
    p += 32; // payer
    let executor = Pubkey::new_from_array(d.get(p..p + 32)?.try_into().ok()?);
    p += 32;
    p += 32 + 32 + 8 + 8 + 8; // input_token, output_token, input_amount, min_output, deadline
    for extra in [32usize, 64, 8] {
        let t = *d.get(p)?;
        p += 1;
        match t {
            0 => {}
            1 => p += extra,
            _ => return None,
        }
    }
    let verified = match *d.get(p)? {
        0 => false,
        1 => true,
        _ => return None,
    };
    p += 1;
    let status = *d.get(p)?;
    Some((task_id, executor, verified, status))
}

#[allow(clippy::too_many_arguments)]
fn issue_cpi<'info>(
    payer: AccountInfo<'info>,
    issuer: AccountInfo<'info>,
    config: AccountInfo<'info>,
    credential: AccountInfo<'info>,
    sys: AccountInfo<'info>,
    referee: AccountInfo<'info>,
    bump: u8,
    subject: Pubkey,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let expires_at = now + CREDENTIAL_SECONDS;

    let mut data = Vec::with_capacity(8 + 32 + 1 + 8);
    data.extend_from_slice(&ISSUE_CREDENTIAL_DISC);
    data.extend_from_slice(subject.as_ref());
    data.push(FLAG_ELIGIBLE);
    data.extend_from_slice(&expires_at.to_le_bytes());

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
    let seeds: &[&[u8]] = &[ISSUER_SEED, &[bump]];
    invoke_signed(&ix, &[payer, issuer, config, credential, sys, referee], &[seeds])?;
    Ok(())
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

        msg!("verifex: agent program {} is immutable; issuing credential to {}", prog.key, subject);
        issue_cpi(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.verifex_issuer.to_account_info(),
            ctx.accounts.config.to_account_info(),
            ctx.accounts.credential.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.referee_program.to_account_info(),
            ctx.bumps.verifex_issuer,
            subject,
        )
    }

    /// Verifex Core: checks that a TrustRail Core commitment is Passed and that its executor_agent
    /// is `subject`, then issues a Referee credential to `subject`.
    pub fn verify_outcome_and_issue(ctx: Context<VerifyOutcomeAndIssue>, subject: Pubkey) -> Result<()> {
        let c = ctx.accounts.commitment.to_account_info();
        require!(*c.owner == TRUSTRAIL_CORE_PROGRAM_ID, VerifexError::BadCommitment);
        let (task_id, executor, verified, status) = {
            let d = c.try_borrow_data()?;
            parse_commitment(&d).ok_or(VerifexError::BadCommitment)?
        };
        // Only TrustRail Core can create an account at this PDA, so this proves it is a real commitment.
        let (expected, _) =
            Pubkey::find_program_address(&[COMMITMENT_SEED, &task_id], &TRUSTRAIL_CORE_PROGRAM_ID);
        require_keys_eq!(expected, *c.key, VerifexError::BadCommitment);
        require!(verified && status == STATUS_PASSED, VerifexError::CommitmentNotPassed);
        require_keys_eq!(executor, subject, VerifexError::SubjectNotExecutor);

        msg!("verifex core: commitment {} is Passed for executor {}; issuing credential", c.key, subject);
        issue_cpi(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.verifex_issuer.to_account_info(),
            ctx.accounts.config.to_account_info(),
            ctx.accounts.credential.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.referee_program.to_account_info(),
            ctx.bumps.verifex_issuer,
            subject,
        )
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

#[derive(Accounts)]
pub struct VerifyOutcomeAndIssue<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: PDA that signs as Referee's issuer; derived from fixed seeds.
    #[account(seeds = [ISSUER_SEED], bump)]
    pub verifex_issuer: UncheckedAccount<'info>,
    /// CHECK: owner, PDA derivation and contents validated in the handler.
    pub commitment: UncheckedAccount<'info>,
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
    #[msg("Not a genuine TrustRail Core commitment account")]
    BadCommitment,
    #[msg("The commitment is not Passed")]
    CommitmentNotPassed,
    #[msg("The subject is not the commitment's executor agent")]
    SubjectNotExecutor,
}
