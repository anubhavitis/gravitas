use anchor_lang::prelude::*;
use crate::state::Creator;
use crate::error::SocialFiError;

#[derive(Accounts)]
#[instruction(name: String, bio: String)]
pub struct CreateCreator<'info> {
    #[account(
        init,
        payer = user,
        space = Creator::LEN,
        seeds = [b"creator", user.key().as_ref()],
        bump
    )]
    pub creator: Account<'info, Creator>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_creator(ctx: Context<CreateCreator>, name: String, bio: String) -> Result<()> {
    require!(name.len() <= 32, SocialFiError::NameTooLong);
    require!(bio.len() <= 256, SocialFiError::BioTooLong);

    let creator = &mut ctx.accounts.creator;
    creator.user = ctx.accounts.user.key();
    creator.name = name;
    creator.bio = bio;
    creator.current_supply = 1;
    creator.bump = ctx.bumps.creator;
    creator.event_count = 0;
    Ok(())
}