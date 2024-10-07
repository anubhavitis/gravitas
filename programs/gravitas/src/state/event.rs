use anchor_lang::prelude::*;

#[account]
pub struct Event {
    pub creator: Pubkey,
    pub title: String,
    pub date: i64,
    pub required_shares: u64,
    pub bump: u8,
}

impl Event {
    pub const LEN: usize = 8 + 32 + 100 + 8 + 8 + 1;
}