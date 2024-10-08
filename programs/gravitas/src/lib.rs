use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;
pub mod error;
pub mod bonding_curve;

use instructions::*;
use state::Creator;

declare_id!("7nkqBwkCschzVvRymkppmcfjVzkEn1VnseemVprVofjX");

#[program]
pub mod gravitas {
    use bonding_curve::BondingCurve;

    use super::*;

    pub fn create_creator(ctx: Context<CreateCreator>, name: String, bio: String) -> Result<()> {
        instructions::create_creator::create_creator(ctx, name, bio)
    }

    pub fn create_event(ctx: Context<CreateEvent>, title: String, date: i64, required_shares: u64) -> Result<()> {
        instructions::create_event::create_event(ctx, title, date, required_shares)
    }

    pub fn buy_shares(ctx: Context<BuyShares>, amount: u64) -> Result<()> {
        instructions::trade_shares::buy_shares(ctx, amount)
    }

    pub fn sell_shares(ctx: Context<SellShares>, amount: u64) -> Result<()> {
        instructions::trade_shares::sell_shares(ctx, amount)
    }

    pub fn get_buy_price(ctx: Context<GetCreatorInfo>, amount: u64) -> Result<u64> {
        let creator = &ctx.accounts.creator;
        let price = BondingCurve::get_buy_price(creator.current_supply, amount);
        Ok(price)
    }

    pub fn get_sell_price(ctx: Context<GetCreatorInfo>, amount: u64) -> Result<u64> {
        let creator = &ctx.accounts.creator;
        let price = BondingCurve::get_sell_price(creator.current_supply, amount);
        Ok(price)
    }

    pub fn get_current_supply(ctx: Context<GetCreatorInfo>) -> Result<u64> {
        let creator = &ctx.accounts.creator;
        Ok(creator.current_supply)
    }

}

#[derive(Accounts)]
pub struct GetCreatorInfo<'info> {
    pub creator: Account<'info, Creator>,
}