use anchor_lang::prelude::*;
use crate::state::{Creator, Event};
use crate::error::SocialFiError;

#[derive(Accounts)]
#[instruction(title: String, date: i64, required_shares: u64)]
pub struct CreateEvent<'info> {
    #[account(
        init,
        payer = creator_account,
        space = Event::LEN,
        seeds = [b"event", creator.key().as_ref(), &creator.event_count.to_le_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
    #[account(
        mut,
        constraint = creator.user == creator_account.key() @ SocialFiError::UnauthorizedCreator
    )]
    pub creator: Account<'info, Creator>,
    #[account(mut)]
    pub creator_account: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_event(ctx: Context<CreateEvent>, title: String, date: i64, required_shares: u64) -> Result<()> {
    require!(title.len() <= 100, SocialFiError::TitleTooLong);
    require!(date > Clock::get()?.unix_timestamp, SocialFiError::InvalidDate);
    require!(required_shares > 0 && required_shares <= ctx.accounts.creator.current_supply, SocialFiError::InvalidRequiredShares);

    let event = &mut ctx.accounts.event;
    event.creator = ctx.accounts.creator.key();
    event.title = title;
    event.date = date;
    event.required_shares = required_shares;
    event.bump = ctx.bumps.event;

    let creator = &mut ctx.accounts.creator;
    creator.event_count += 1;

    Ok(())
}