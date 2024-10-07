use anchor_lang::prelude::*;
use crate::state::Creator;
use crate::error::SocialFiError;
use crate::bonding_curve::BondingCurve;

#[derive(Accounts)]
pub struct BuyShares<'info> {
    #[account(mut)]
    pub creator: Account<'info, Creator>,
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(
        mut,
        seeds = [b"contract"],
        bump
    )]
    pub contract_account: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn buy_shares(ctx: Context<BuyShares>, amount: u64) -> Result<()> {
    let creator = &mut ctx.accounts.creator;
    let trader = &ctx.accounts.trader;
    let contract_account = &ctx.accounts.contract_account;
    
    require!(amount > 0, SocialFiError::InvalidAmount);

    let price = BondingCurve::get_buy_price(creator.current_supply, amount);
    let creator_commission = price * 20 / 100; // 10% commission
    let total_cost = price + creator_commission;


    require!(trader.lamports() >= total_cost, SocialFiError::InsufficientFunds);

    // Transfer SOL from trader to contract
     anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: trader.to_account_info(),
                to: contract_account.to_account_info(),
            },
        ),
        price,
    )?;

    // Transfer commission from trader to creator
     anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: trader.to_account_info(),
                to: creator.to_account_info(),
            },
        ),
        creator_commission,
    )?;

    // Update current supply
    creator.current_supply += amount;

    Ok(())
}


#[derive(Accounts)]
pub struct SellShares<'info> {
    #[account(mut)]
    pub creator: Account<'info, Creator>,
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(
        mut,
        seeds = [b"contract"],
        bump
    )]
    pub contract_account: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn sell_shares(ctx: Context<SellShares>, amount: u64) -> Result<()> {
    let creator = &mut ctx.accounts.creator;
    let trader = &ctx.accounts.trader;
    let contract_account = &ctx.accounts.contract_account;
    
    require!(amount > 0, SocialFiError::InvalidAmount);
    require!(amount <= creator.current_supply, SocialFiError::InsufficientShares);

    let price = BondingCurve::get_sell_price(creator.current_supply, amount);
    let creator_commission = price * 5 / 100; // 5% commission
    let payout = price - creator_commission;


    // Transfer SOL from contract to trader
    let contract_account_bump = ctx.bumps.contract_account;
    let seeds = &[b"contract" as &[u8], &[contract_account_bump]];

    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: contract_account.to_account_info(),
                to: trader.to_account_info(),
            },
            &[seeds],
        ),
        payout,
    )?;

    // Transfer commission from contract to creator
    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: contract_account.to_account_info(),
                to: creator.to_account_info(),
            },
            &[seeds],
        ),
        creator_commission,
    )?;

    // Update current supply
    creator.current_supply -= amount;

    Ok(())
}