use anchor_lang::prelude::*;

#[account]
pub struct Creator {
    pub user: Pubkey,
    pub name: String,
    pub bio: String,
    pub current_supply: u64,
    pub event_count: u64,
    pub bump: u8,
}

impl Creator {
    pub const LEN: usize = 8 + 32 + 32 + 256 + 8 + 8 + 1;
}
