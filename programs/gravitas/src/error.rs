use anchor_lang::prelude::*;

#[error_code]
pub enum SocialFiError {
    #[msg("Name is too long")]
    NameTooLong,
    #[msg("Bio is too long")]
    BioTooLong,
    #[msg("Title is too long")]
    TitleTooLong,
    #[msg("Invalid date")]
    InvalidDate,
    #[msg("Invalid required shares")]
    InvalidRequiredShares,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient shares")]
    InsufficientShares,
    #[msg("Insufficient contract balance")]
    InsufficientContractBalance,
    #[msg("Unauthorized creator")]
    UnauthorizedCreator,
    #[msg("Insufficient funds")]
    InsufficientFunds,
}
