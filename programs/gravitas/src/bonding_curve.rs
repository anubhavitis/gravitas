pub struct BondingCurve;

impl BondingCurve {
    // Constants for the bonding curve
    const A: u64 = 100; // Base price in lamports
    const B: u64 = 10;  // Steepness factor

    pub fn get_price(supply: u64) -> u64 {
        // Formula: P = A * e^(B * supply / 10^6)
        // We'll use a simplified version: P = A * (1 + B * supply / 10^6)
        let base_price = Self::A;
        let factor = supply.checked_mul(Self::B).unwrap_or(u64::MAX) / 1_000_000;
        base_price.saturating_add(base_price.saturating_mul(factor))
    }

    pub fn get_buy_price(supply: u64, amount: u64) -> u64 {
        let start_price = Self::get_price(supply);
        let end_price = Self::get_price(supply + amount);
        (start_price + end_price) * amount / 2 // Average price * amount
    }

    pub fn get_sell_price(supply: u64, amount: u64) -> u64 {
        let start_price = Self::get_price(supply - amount);
        let end_price = Self::get_price(supply);
        (start_price + end_price) * amount / 2 // Average price * amount
    }
}