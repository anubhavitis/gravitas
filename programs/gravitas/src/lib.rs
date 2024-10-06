use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};

declare_id!("Htc9ae9f2RvBpS7iwkWFA5RnaPTBAF6Fgz3GPs69DyiF");

#[derive(Accounts)]
#[instruction(event_id: u64)]
pub struct CreateEvent<'info> {
    #[account(
        init,
        payer = creator,
        space = Event::LEN,
        seeds = [b"event", creator.key().as_ref(), &event_id.to_le_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub token_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterForEvent<'info> {
    #[account(
        mut,
        constraint = event.required_token_mint == user_token_account.mint @ ErrorCode::InvalidToken
    )]
    pub event: Account<'info, Event>,
    pub user: Signer<'info>,
    #[account(
        constraint = user_token_account.owner == user.key() @ ErrorCode::InvalidTokenAccount
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct CancelEvent<'info> {
    #[account(
        mut,
        constraint = event.creator == creator.key()
    )]
    pub event: Account<'info, Event>,
    pub creator: Signer<'info>,
}

#[account]
pub struct Event {
    pub creator: Pubkey,
    pub event_id: u64,
    pub name: String,
    pub description: String,
    pub start_time: i64,
    pub end_time: i64,
    pub required_token_mint: Pubkey,
    pub required_token_amount: u64,
    pub is_active: bool,
    pub max_capacity: u32,
    pub participants: Vec<Pubkey>,
}

impl Event {
    const LEN: usize = 8 + // discriminator
        32 + // creator: Pubkey
        8 + // event_id: u64
        (4 + 256) + // name: String (4 bytes for length + 256 bytes for content)
        (4 + 256) + // description: String (4 bytes for length + 256 bytes for content)
        8 + // start_time: i64
        8 + // end_time: i64
        32 + // required_token_mint: Pubkey
        8 + // required_token_amount: u64
        1 + // is_active: bool
        4 + // max_capacity: u32
        4 + (32 * 100) // participants: Vec<Pubkey> (4 bytes for length + 32 bytes per pubkey * 100 participants)
        + 1000;
}

#[error_code]
pub enum ErrorCode {
    #[msg("Event is not active")]
    EventNotActive,
    #[msg("Insufficient tokens to register for the event")]
    InsufficientTokens,
    #[msg("User is already registered for this event")]
    AlreadyRegistered,
    #[msg("Event has reached maximum capacity")]
    EventFull,
    #[msg("Invalid token for this event")]
    InvalidToken,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
}

#[event]
pub struct UserRegistered {
    pub event_id: u64,
    pub user: Pubkey,
    pub timestamp: i64,
}

#[program]
pub mod gravitas {
    use super::*;

    pub fn create_event(
        ctx: Context<CreateEvent>,
        event_id: u64,
        name: String,
        description: String,
        start_time: i64,
        end_time: i64,
        required_token_amount: u64,
        max_capacity: u32,
    ) -> Result<()> {
        let event = &mut ctx.accounts.event;
        let creator = &ctx.accounts.creator;

        event.creator = creator.key();
        event.event_id = event_id;
        event.name = name;
        event.description = description;
        event.start_time = start_time;
        event.end_time = end_time;
        event.required_token_amount = required_token_amount;
        event.required_token_mint = ctx.accounts.token_mint.key();
        event.is_active = true;
        event.max_capacity = max_capacity;
        event.participants = Vec::new();

        Ok(())
    }

    pub fn register_for_event(ctx: Context<RegisterForEvent>) -> Result<()> {
        let event = &mut ctx.accounts.event;
        let user_token_account = &ctx.accounts.user_token_account;
        let user = &ctx.accounts.user;

        // Check if the event is active
        require!(event.is_active, ErrorCode::EventNotActive);

        // Check if the user has the required token amount
        require!(
            user_token_account.amount >= event.required_token_amount,
            ErrorCode::InsufficientTokens
        );

        // Check if the user is already registered
        require!(
            !event.participants.contains(&user.key()),
            ErrorCode::AlreadyRegistered
        );

        // Check if the event has reached its maximum capacity
        require!(
            event.participants.len() < event.max_capacity as usize,
            ErrorCode::EventFull
        );

        // Add the user to the event's participant list
        event.participants.push(user.key());

        // Emit an event for successful registration
        emit!(UserRegistered {
            event_id: event.event_id,
            user: user.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn cancel_event(ctx: Context<CancelEvent>) -> Result<()> {
        let event = &mut ctx.accounts.event;
        require!(event.is_active, ErrorCode::EventNotActive);

        event.is_active = false;

        Ok(())
    }
}
