#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey::PUBKEY_BYTES;
use anchor_lang::system_program;

const DISCRIMINATOR_LENGTH: usize = 8;
const U64_LENGTH: usize = 8;

declare_id!("58s6m6wviFffZdMkZMCRbeW3jAq2gFnDdBhgiy2VXHWY");

#[program]
pub mod rust_test_4 {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.total_balance = 0;
        Ok(())
    }

    pub fn initialize_deposit(ctx: Context<InitializeDeposit>) -> Result<()> {
        let user_deposit = &mut ctx.accounts.user_deposit;
        user_deposit.owner = ctx.accounts.user.key();
        user_deposit.balance = 0;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        let vault = &mut ctx.accounts.vault;
        let user_deposit = &mut ctx.accounts.user_deposit;

        vault.total_balance = vault
            .total_balance
            .checked_add(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        user_deposit.balance = user_deposit
            .balance
            .checked_add(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let user_deposit = &mut ctx.accounts.user_deposit;
        let vault = &mut ctx.accounts.vault;


        require!(
            user_deposit.balance >= amount,
            CustomError::InsufficientFunds
        );


        vault.total_balance = vault
            .total_balance
            .checked_sub(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        user_deposit.balance = user_deposit
            .balance
            .checked_sub(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        let from = ctx.accounts.vault.to_account_info();
        let to = ctx.accounts.user.to_account_info();

        **from.try_borrow_mut_lamports()? = from
            .lamports()
            .checked_sub(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        **to.try_borrow_mut_lamports()? = to
            .lamports()
            .checked_add(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = DISCRIMINATOR_LENGTH + PUBKEY_BYTES + U64_LENGTH,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeDeposit<'info> {
    #[account(
        init,
        payer = user,
        space = DISCRIMINATOR_LENGTH + PUBKEY_BYTES + U64_LENGTH,
        seeds = [b"deposit", user.key().as_ref()],
        bump
    )]
    pub user_deposit: Account<'info, UserDeposit>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"deposit", user.key().as_ref()],
        bump,
        constraint = user_deposit.owner == user.key() @ CustomError::UnauthorizedAccess
    )]
    pub user_deposit: Account<'info, UserDeposit>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"deposit", user.key().as_ref()],
        bump,
        constraint = user_deposit.owner == user.key() @ CustomError::UnauthorizedAccess
    )]
    pub user_deposit: Account<'info, UserDeposit>,
    #[account(mut)]
    pub user: Signer<'info>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub total_balance: u64,
}

#[account]
pub struct UserDeposit {
    pub owner: Pubkey,
    pub balance: u64,
}

#[error_code]
pub enum CustomError {
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
}
