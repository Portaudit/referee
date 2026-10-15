// Copyright 2026 Ishvir Jackpersad
// SPDX-License-Identifier: Apache-2.0
//
// REFEREE: an independent settlement authority for Solana DvP trades.
// Independent project; not affiliated with or endorsed by the Solana Foundation or J.P. Morgan.
// Unaudited. Devnet only.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

declare_id!("EeviRiwTbsLcnYCkagwppFD9aRmN6fVeax9WN3tuTZEe");

/// The Solana Foundation's DvP program (same address on devnet and mainnet-beta per its docs).
pub const DVP_PROGRAM_ID: Pubkey = pubkey!("dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq");
/// Classic SPL Token program.
pub const TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
/// Token-2022 program. Accepted for plain mints; extensions (transfer hooks, fees, ...) are not checked here.
pub const TOKEN_2022_PROGRAM_ID: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

pub fn is_supported_token_program(k: Pubkey) -> bool {
    k == TOKEN_PROGRAM_ID || k == TOKEN_2022_PROGRAM_ID
}
/// Only this key may create the config account (demo admin, the Fall School wallet).
pub const ADMIN: Pubkey = pubkey!("4KL6wnU7XayFWmziJ9U4bm17HP61FKuFpKbtphQazYLT");

pub const AUTHORITY_SEED: &[u8] = b"authority";
pub const CONFIG_SEED: &[u8] = b"config";
pub const CRED_SEED: &[u8] = b"cred";
pub const TRADE_SEED: &[u8] = b"trade";

/// Credential flag bit 0: eligible to settle.
pub const FLAG_ELIGIBLE: u8 = 1;

// DvP SwapDvp record layout (458 bytes). Offsets 1 to 257 and 449 were confirmed against a real
// devnet account. The destination offsets (321, 353) are derived from the source and still need
// confirming against a real record.
pub const DVP_RECORD_LEN: usize = 458;
const OFF_USER_A: usize = 1;
const OFF_USER_B: usize = 33;
const OFF_AUTHORITY: usize = 129;
const OFF_TOKEN_PROGRAM_A: usize = 161;
const OFF_TOKEN_PROGRAM_B: usize = 193;
const OFF_AMOUNT_A: usize = 225;
const OFF_AMOUNT_B: usize = 233;
const OFF_EXPIRY: usize = 241;
const OFF_DEST_A: usize = 321;
const OFF_DEST_B: usize = 353;

fn key_at(d: &[u8], o: usize) -> Pubkey {
    let mut b = [0u8; 32];
    b.copy_from_slice(&d[o..o + 32]);
    Pubkey::new_from_array(b)
}

fn u64_at(d: &[u8], o: usize) -> u64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&d[o..o + 8]);
    u64::from_le_bytes(b)
}

fn i64_at(d: &[u8], o: usize) -> i64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&d[o..o + 8]);
    i64::from_le_bytes(b)
}

fn check_credential(c: &Credential, issuer: &Pubkey, now: i64) -> Result<()> {
    require_keys_eq!(c.issuer, *issuer, RefereeError::CredentialIssuer);
    require!(c.flags & FLAG_ELIGIBLE != 0, RefereeError::CredentialNotEligible);
    require!(c.expires_at > now, RefereeError::CredentialExpired);
    Ok(())
}

#[program]
pub mod referee_stub {
    use super::*;

    /// One-time setup: records the admin and the demo credential issuer.
    pub fn init_config(ctx: Context<InitConfig>, issuer: Pubkey) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.issuer = issuer;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    /// The issuer attests that a subject may settle until expires_at (unix seconds).
    pub fn issue_credential(
        ctx: Context<IssueCredential>,
        subject: Pubkey,
        flags: u8,
        expires_at: i64,
    ) -> Result<()> {
        let c = &mut ctx.accounts.credential;
        c.subject = subject;
        c.issuer = ctx.accounts.issuer.key();
        c.flags = flags;
        c.expires_at = expires_at;
        c.bump = ctx.bumps.credential;
        emit!(CredentialSet {
            subject,
            issuer: ctx.accounts.issuer.key(),
            flags,
            expires_at,
        });
        Ok(())
    }

    /// The issuer changes the flags or expiry of an existing credential (revoke or renew).
    pub fn set_credential(ctx: Context<SetCredential>, flags: u8, expires_at: i64) -> Result<()> {
        let c = &mut ctx.accounts.credential;
        c.flags = flags;
        c.expires_at = expires_at;
        emit!(CredentialSet {
            subject: c.subject,
            issuer: ctx.accounts.issuer.key(),
            flags,
            expires_at,
        });
        Ok(())
    }

    /// Both parties co-sign the exact terms of a DvP trade that names this program's PDA as the
    /// settlement authority. DvP's create is permissionless, so a record alone proves nothing.
    pub fn register_trade<'info>(
        ctx: Context<'info, RegisterTrade<'info>>,
        amount_a: u64,
        amount_b: u64,
        refund_to: Pubkey,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let authority = ctx.accounts.authority_pda.key();
        let signer_a = ctx.accounts.user_a.key();
        let signer_b = ctx.accounts.user_b.key();
        let swap = ctx.accounts.swap_dvp.to_account_info();

        require_keys_eq!(*swap.owner, DVP_PROGRAM_ID, RefereeError::RecordNotDvpOwned);
        {
            let data = swap.try_borrow_data()?;
            let d: &[u8] = &data[..];
            require_eq!(d.len(), DVP_RECORD_LEN, RefereeError::RecordWrongSize);

            require_keys_eq!(key_at(d, OFF_AUTHORITY), authority, RefereeError::WrongAuthority);
            require_keys_eq!(key_at(d, OFF_USER_A), signer_a, RefereeError::PartyMismatch);
            require_keys_eq!(key_at(d, OFF_USER_B), signer_b, RefereeError::PartyMismatch);
            require_keys_neq!(signer_a, signer_b, RefereeError::SameParty);
            require!(is_supported_token_program(key_at(d, OFF_TOKEN_PROGRAM_A)), RefereeError::TokenProgramNotSpl);
            require!(is_supported_token_program(key_at(d, OFF_TOKEN_PROGRAM_B)), RefereeError::TokenProgramNotSpl);
            require_eq!(u64_at(d, OFF_AMOUNT_A), amount_a, RefereeError::AmountMismatch);
            require_eq!(u64_at(d, OFF_AMOUNT_B), amount_b, RefereeError::AmountMismatch);
            require!(i64_at(d, OFF_EXPIRY) > now, RefereeError::RecordExpired);
            // Proceeds must go to the parties themselves (assumed encoding of "no redirect").
            require!(key_at(d, OFF_DEST_A) == signer_a || key_at(d, OFF_DEST_A) == Pubkey::default(), RefereeError::DestinationRedirected);
            require!(key_at(d, OFF_DEST_B) == signer_b || key_at(d, OFF_DEST_B) == Pubkey::default(), RefereeError::DestinationRedirected);
        }

        let t = &mut ctx.accounts.trade;
        t.swap_dvp = swap.key();
        t.user_a = signer_a;
        t.user_b = signer_b;
        t.refund_to = refund_to;
        t.amount_a = amount_a;
        t.amount_b = amount_b;
        t.registered_at = now;
        t.bump = ctx.bumps.trade;
        msg!("referee: trade registered {}", swap.key());
        emit!(TradeRegistered {
            swap_dvp: swap.key(),
            user_a: signer_a,
            user_b: signer_b,
            refund_to,
            amount_a,
            amount_b,
        });
        Ok(())
    }

    /// Anyone may trigger settlement of a registered trade whose parties both hold a valid
    /// credential. This program's PDA then signs DvP's SettleDvp. The 12 remaining accounts are
    /// the SettleDvp accounts after the authority and swap_dvp (mint_a, mint_b, dvp_ata_a,
    /// dvp_ata_b, user_a_destination_ata_b, user_b_destination_ata_a, user_a_ata_a, user_b_ata_b,
    /// token_program_a, token_program_b, memo_program), then the DvP program.
    pub fn settle<'info>(ctx: Context<'info, Settle<'info>>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let issuer = ctx.accounts.config.issuer;
        check_credential(&ctx.accounts.credential_a, &issuer, now)?;
        check_credential(&ctx.accounts.credential_b, &issuer, now)?;

        let rest = ctx.remaining_accounts;
        require_eq!(rest.len(), 12, RefereeError::BadAccountCount);
        require_keys_eq!(*rest[11].key, DVP_PROGRAM_ID, RefereeError::WrongDvpProgram);

        let pda_info = ctx.accounts.authority_pda.to_account_info();
        let swap_info = ctx.accounts.swap_dvp.to_account_info();

        let mut metas: Vec<AccountMeta> = Vec::with_capacity(13);
        metas.push(AccountMeta::new(*pda_info.key, true));
        metas.push(AccountMeta::new(*swap_info.key, false));
        for a in &rest[..11] {
            metas.push(if a.is_writable {
                AccountMeta::new(*a.key, false)
            } else {
                AccountMeta::new_readonly(*a.key, false)
            });
        }

        let ix = Instruction {
            program_id: DVP_PROGRAM_ID,
            accounts: metas,
            data: vec![2u8, 0u8],
        };

        let bump = ctx.bumps.authority_pda;
        let signer_seeds: &[&[u8]] = &[AUTHORITY_SEED, &[bump]];
        let mut infos: Vec<AccountInfo> = Vec::with_capacity(14);
        infos.push(pda_info.clone());
        infos.push(swap_info.clone());
        infos.extend(rest.iter().cloned());

        msg!("referee: settling trade {}", swap_info.key);
        let before = pda_info.lamports();
        invoke_signed(&ix, &infos, &[signer_seeds])?;
        // DvP sweeps all closed-account rent to its authority (this PDA). Return exactly that to refund_to.
        let gained = pda_info.lamports().saturating_sub(before);
        if gained > 0 {
            let cpi = anchor_lang::system_program::Transfer {
                from: pda_info.clone(),
                to: ctx.accounts.refund_to.to_account_info(),
            };
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(anchor_lang::system_program::ID, cpi, &[signer_seeds]),
                gained,
            )?;
        }
        msg!("referee: returned {} lamports of rent to {}", gained, ctx.accounts.refund_to.key());
        emit!(TradeSettled {
            swap_dvp: *swap_info.key,
            user_a: ctx.accounts.trade.user_a,
            user_b: ctx.accounts.trade.user_b,
            amount_a: ctx.accounts.trade.amount_a,
            amount_b: ctx.accounts.trade.amount_b,
            rent_returned: gained,
            refund_to: ctx.accounts.refund_to.key(),
        });
        Ok(())
    }

    /// Closes the registration of a trade whose DvP record no longer exists (for example it was
    /// rejected or reclaimed through DvP) and returns the registration rent to refund_to. Anyone may call it.
    pub fn close_trade<'info>(ctx: Context<'info, CloseTrade<'info>>) -> Result<()> {
        let swap = ctx.accounts.swap_dvp.to_account_info();
        require!(
            *swap.owner != DVP_PROGRAM_ID && swap.data_is_empty(),
            RefereeError::TradeStillOpen
        );
        emit!(TradeClosed {
            swap_dvp: swap.key(),
            refund_to: ctx.accounts.refund_to.key(),
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut, address = ADMIN @ RefereeError::NotAdmin)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(subject: Pubkey)]
pub struct IssueCredential<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub issuer: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = issuer @ RefereeError::NotIssuer
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = payer,
        space = 8 + Credential::INIT_SPACE,
        seeds = [CRED_SEED, subject.as_ref()],
        bump
    )]
    pub credential: Account<'info, Credential>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetCredential<'info> {
    pub issuer: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = issuer @ RefereeError::NotIssuer
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [CRED_SEED, credential.subject.as_ref()],
        bump = credential.bump
    )]
    pub credential: Account<'info, Credential>,
}

#[derive(Accounts)]
pub struct RegisterTrade<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub user_a: Signer<'info>,
    pub user_b: Signer<'info>,
    /// CHECK: the DvP trade record. Owner, size and contents are verified in the handler.
    pub swap_dvp: UncheckedAccount<'info>,
    /// CHECK: this program's authority PDA; the seeds constraint fixes its address.
    #[account(seeds = [AUTHORITY_SEED], bump)]
    pub authority_pda: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Trade::INIT_SPACE,
        seeds = [TRADE_SEED, swap_dvp.key().as_ref()],
        bump
    )]
    pub trade: Account<'info, Trade>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    /// CHECK: this program's authority PDA. It signs only through invoke_signed.
    #[account(mut, seeds = [AUTHORITY_SEED], bump)]
    pub authority_pda: UncheckedAccount<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: the DvP trade record; DvP validates it during the CPI, and the trade seeds bind it.
    #[account(mut)]
    pub swap_dvp: UncheckedAccount<'info>,
    #[account(
        mut,
        close = refund_to,
        seeds = [TRADE_SEED, swap_dvp.key().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, Trade>,
    #[account(seeds = [CRED_SEED, trade.user_a.as_ref()], bump = credential_a.bump)]
    pub credential_a: Account<'info, Credential>,
    #[account(seeds = [CRED_SEED, trade.user_b.as_ref()], bump = credential_b.bump)]
    pub credential_b: Account<'info, Credential>,
    /// CHECK: receives the trade registration rent; must equal the address both parties signed.
    #[account(mut, address = trade.refund_to)]
    pub refund_to: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseTrade<'info> {
    /// CHECK: the DvP trade record address; the handler requires that it no longer exists as a DvP account.
    pub swap_dvp: UncheckedAccount<'info>,
    #[account(
        mut,
        close = refund_to,
        seeds = [TRADE_SEED, swap_dvp.key().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, Trade>,
    /// CHECK: receives the registration rent; must equal the address both parties signed.
    #[account(mut, address = trade.refund_to)]
    pub refund_to: UncheckedAccount<'info>,
}

#[event]
pub struct TradeRegistered {
    pub swap_dvp: Pubkey,
    pub user_a: Pubkey,
    pub user_b: Pubkey,
    pub refund_to: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
}

#[event]
pub struct TradeSettled {
    pub swap_dvp: Pubkey,
    pub user_a: Pubkey,
    pub user_b: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
    pub rent_returned: u64,
    pub refund_to: Pubkey,
}

#[event]
pub struct TradeClosed {
    pub swap_dvp: Pubkey,
    pub refund_to: Pubkey,
}

#[event]
pub struct CredentialSet {
    pub subject: Pubkey,
    pub issuer: Pubkey,
    pub flags: u8,
    pub expires_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub issuer: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Credential {
    pub subject: Pubkey,
    pub issuer: Pubkey,
    pub flags: u8,
    pub expires_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Trade {
    pub swap_dvp: Pubkey,
    pub user_a: Pubkey,
    pub user_b: Pubkey,
    pub refund_to: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
    pub registered_at: i64,
    pub bump: u8,
}

#[error_code]
pub enum RefereeError {
    #[msg("Only the admin can do this")]
    NotAdmin,
    #[msg("Only the configured issuer can do this")]
    NotIssuer,
    #[msg("The trade record is not owned by the DvP program")]
    RecordNotDvpOwned,
    #[msg("The trade record has the wrong size")]
    RecordWrongSize,
    #[msg("The trade does not name this referee as its settlement authority")]
    WrongAuthority,
    #[msg("The trade parties do not match the signers")]
    PartyMismatch,
    #[msg("The two parties must be different")]
    SameParty,
    #[msg("Only classic SPL Token or Token-2022 legs are supported")]
    TokenProgramNotSpl,
    #[msg("The signed amounts do not match the trade record")]
    AmountMismatch,
    #[msg("The trade redirects settlement proceeds away from the parties")]
    DestinationRedirected,
    #[msg("The trade has already expired")]
    RecordExpired,
    #[msg("The credential was not issued by the current issuer")]
    CredentialIssuer,
    #[msg("The credential is not marked eligible")]
    CredentialNotEligible,
    #[msg("The credential has expired")]
    CredentialExpired,
    #[msg("Wrong number of remaining accounts")]
    BadAccountCount,
    #[msg("The last remaining account must be the DvP program")]
    WrongDvpProgram,
    #[msg("The DvP trade record still exists; settle it or reject it first")]
    TradeStillOpen,
}
