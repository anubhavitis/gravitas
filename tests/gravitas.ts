import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Gravitas } from "../target/types/gravitas";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from "@solana/web3.js";
import { expect } from "chai";
import { BN } from "bn.js";

describe("socialfi", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Gravitas as Program<Gravitas>;

  let creator: Keypair;
  let trader: Keypair;
  let creatorPda: PublicKey;
  let contractAccount: PublicKey;

  async function createAndFundKeypair(): Promise<Keypair> {
    const keypair = Keypair.generate();
    console.log(`Requesting airdrop for ${keypair.publicKey.toBase58()}`);
    const airdropSignature = await provider.connection.requestAirdrop(
      keypair.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);
    console.log(`Airdrop confirmed for ${keypair.publicKey.toBase58()}`);
    return keypair;
  }

  before(async () => {
    console.log("Setting up test environment...");

    // Create and fund keypairs
    creator = await createAndFundKeypair();
    trader = await createAndFundKeypair();

    // Derive PDAs
    [creatorPda] = await PublicKey.findProgramAddress(
      [Buffer.from("creator"), creator.publicKey.toBuffer()],
      program.programId
    );

    [contractAccount] = await PublicKey.findProgramAddress(
      [Buffer.from("contract")],
      program.programId
    );

    // Initialize and fund the contract account
    const rentExemptBalance =
      await provider.connection.getMinimumBalanceForRentExemption(0);
    const tx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: contractAccount,
        lamports: rentExemptBalance,
      })
    );
    await provider.sendAndConfirm(tx);

    console.log("Test environment set up complete.");
  });

  it("Creates a creator", async () => {
    console.log("Testing creator creation...");

    const name = "Tech Guru";
    const bio = "Sharing insights on the latest tech trends.";

    const tx = await program.methods
      .createCreator(name, bio)
      .accounts({
        creator: creatorPda,
        user: creator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    console.log("Transaction signature for creator creation:", tx);
    const creatorAccount = await program.account.creator.fetch(creatorPda);

    expect(creatorAccount.name).to.equal(name);
    expect(creatorAccount.bio).to.equal(bio);
    expect(creatorAccount.currentSupply.toNumber()).to.equal(0);

    console.log("Creator created successfully.");
  });

  it("Buys initial shares for creator", async () => {
    console.log("Buying initial shares for creator...");

    const amount = new BN(1000); // Buy 1000 shares

    const tx = await program.methods
      .buyShares(amount)
      .accounts({
        creator: creatorPda,
        trader: creator.publicKey,
        contractAccount: contractAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    console.log("Transaction signature for initial share creation:", tx);
    const creatorAccount = await program.account.creator.fetch(creatorPda);
    console.log("Creator account:", creatorAccount);
    expect(creatorAccount.currentSupply.toNumber()).to.equal(amount.toNumber());

    console.log(
      `Initial shares bought successfully. Current supply: ${creatorAccount.currentSupply.toNumber()}`
    );
  });

  it("Gets current buy price", async () => {
    console.log("Testing get current buy price...");

    const amount = new BN(100);

    const buyPrice = await program.methods
      .getBuyPrice(amount)
      .accounts({
        creator: creatorPda,
      })
      .view();

    console.log(`Current buy price for ${amount} shares: ${buyPrice} lamports`);
    expect(buyPrice.toNumber()).to.be.above(0);
  });

  it("Gets current sell price", async () => {
    console.log("Testing get current sell price...");

    const amount = new BN(100);

    const sellPrice = await program.methods
      .getSellPrice(amount)
      .accounts({
        creator: creatorPda,
      })
      .view();

    console.log(
      `Current sell price for ${amount} shares: ${sellPrice} lamports`
    );
    expect(sellPrice.toNumber()).to.be.above(0);
  });

  it("Gets current supply", async () => {
    console.log("Testing get current supply...");

    const currentSupply = await program.methods
      .getCurrentSupply()
      .accounts({
        creator: creatorPda,
      })
      .view();

    console.log(`Current supply: ${currentSupply} shares`);
    expect(currentSupply.toNumber()).to.be.gte(0);
  });

  it("Creates an event", async () => {
    console.log("Testing event creation...");

    const title = "AI in 2025: What to Expect";
    const date = new BN(Math.floor(Date.now() / 1000) + 86400); // 1 day from now
    const requiredShares = new BN(100);

    // Fetch the current creator account
    const creatorAccount = await program.account.creator.fetch(creatorPda);
    console.log("Creator account:", creatorAccount);

    // Derive the event PDA
    const [eventPda] = await PublicKey.findProgramAddress(
      [
        Buffer.from("event"),
        creatorPda.toBuffer(),
        new BN(creatorAccount.eventCount).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    console.log(`Attempting to create event with PDA: ${eventPda.toBase58()}`);
    console.log(`Creator PDA: ${creatorPda.toBase58()}`);
    console.log(`Event count: ${creatorAccount.eventCount}`);

    try {
      const tx = await program.methods
        .createEvent(title, date, requiredShares)
        .accounts({
          event: eventPda,
          creator: creatorPda,
          creatorAccount: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      console.log("Transaction signature for event creation:", tx);
      const eventAccount = await program.account.event.fetch(eventPda);

      expect(eventAccount.title).to.equal(title);
      expect(eventAccount.date.toNumber()).to.equal(date.toNumber());
      expect(eventAccount.requiredShares.toNumber()).to.equal(
        requiredShares.toNumber()
      );

      console.log("Event created successfully.");
    } catch (error) {
      console.error("Error creating event:", error);
      throw error;
    }
  });
  it("Buys shares", async () => {
    console.log("Testing share purchase...");

    const amount = new BN(100000);

    const traderBalanceBefore = await provider.connection.getBalance(
      trader.publicKey
    );
    const creatorBalanceBefore = await provider.connection.getBalance(
      creator.publicKey
    );
    const contractBalanceBefore = await provider.connection.getBalance(
      contractAccount
    );

    console.log(
      `Trader balance before: ${traderBalanceBefore / LAMPORTS_PER_SOL} SOL`
    );
    console.log(
      `Creator balance before: ${creatorBalanceBefore / LAMPORTS_PER_SOL} SOL`
    );
    console.log(
      `Contract balance before: ${contractBalanceBefore / LAMPORTS_PER_SOL} SOL`
    );

    const tx = await program.methods
      .buyShares(amount)
      .accounts({
        creator: creatorPda,
        trader: trader.publicKey,
        contractAccount: contractAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    console.log("Transaction signature for share purchase:", tx);
    const creatorAccount = await program.account.creator.fetch(creatorPda);
    const traderBalanceAfter = await provider.connection.getBalance(
      trader.publicKey
    );
    const creatorBalanceAfter = await provider.connection.getBalance(
      creator.publicKey
    );
    const contractBalanceAfter = await provider.connection.getBalance(
      contractAccount
    );

    console.log(
      `Trader balance after: ${traderBalanceAfter / LAMPORTS_PER_SOL} SOL`
    );
    console.log(
      `Creator balance after: ${creatorBalanceAfter / LAMPORTS_PER_SOL} SOL`
    );
    console.log(
      `Contract balance after: ${contractBalanceAfter / LAMPORTS_PER_SOL} SOL`
    );

    console.log(
      `Trader spent: ${
        (traderBalanceBefore - traderBalanceAfter) / LAMPORTS_PER_SOL
      } SOL`
    );
    console.log(
      `Creator earned: ${
        (creatorBalanceAfter - creatorBalanceBefore) / LAMPORTS_PER_SOL
      } SOL`
    );
    console.log(
      `Contract received: ${
        (contractBalanceAfter - contractBalanceBefore) / LAMPORTS_PER_SOL
      } SOL`
    );

    expect(creatorAccount.currentSupply.toNumber()).to.equal(
      amount.toNumber() + 1000
    ); // 1000 initial + 100 new
    expect(traderBalanceAfter).to.be.below(traderBalanceBefore);
    // expect(creatorBalanceAfter).to.be.above(creatorBalanceBefore); to.be above or equal
    expect(creatorBalanceAfter).to.be.greaterThanOrEqual(creatorBalanceBefore);
    expect(contractBalanceAfter).to.be.above(contractBalanceBefore);

    console.log("Shares purchased successfully.");
    console.log(`Current supply: ${creatorAccount.currentSupply.toNumber()}`);
  });

  it("Sells shares", async () => {
    console.log("Testing share sale...");

    const amount = new BN(50);

    const traderBalanceBefore = await provider.connection.getBalance(
      trader.publicKey
    );
    const creatorBalanceBefore = await provider.connection.getBalance(
      creator.publicKey
    );
    const contractBalanceBefore = await provider.connection.getBalance(
      contractAccount
    );

    console.log(
      `Trader balance before: ${traderBalanceBefore / LAMPORTS_PER_SOL} SOL`
    );
    console.log(
      `Creator balance before: ${creatorBalanceBefore / LAMPORTS_PER_SOL} SOL`
    );
    console.log(
      `Contract balance before: ${contractBalanceBefore / LAMPORTS_PER_SOL} SOL`
    );

    try {
      // Now execute the actual transaction
      const tx = await program.methods
        .sellShares(amount)
        .accounts({
          creator: creatorPda,
          trader: trader.publicKey,
          contractAccount: contractAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([trader])
        .rpc();
      console.log("Transaction signature:", tx);

      // Fetch the transaction details
      const txDetails = await provider.connection.getTransaction(tx, {
        commitment: "confirmed",
      });
      console.log("Transaction logs:", txDetails?.meta?.logMessages);
    } catch (error) {
      console.error("Error during share sale:", error);
      throw error;
    }

    const creatorAccount = await program.account.creator.fetch(creatorPda);
    const traderBalanceAfter = await provider.connection.getBalance(
      trader.publicKey
    );
    const creatorBalanceAfter = await provider.connection.getBalance(
      creator.publicKey
    );
    const contractBalanceAfter = await provider.connection.getBalance(
      contractAccount
    );

    console.log(
      `Trader balance after: ${traderBalanceAfter / LAMPORTS_PER_SOL} SOL`
    );
    console.log(
      `Creator balance after: ${creatorBalanceAfter / LAMPORTS_PER_SOL} SOL`
    );
    console.log(
      `Contract balance after: ${contractBalanceAfter / LAMPORTS_PER_SOL} SOL`
    );

    expect(creatorAccount.currentSupply.toNumber()).to.equal(100950); // 1000 - 50
    expect(traderBalanceAfter).to.be.above(traderBalanceBefore);
    expect(creatorBalanceAfter).to.be.greaterThanOrEqual(creatorBalanceBefore);
    expect(contractBalanceAfter).to.be.below(contractBalanceBefore);

    console.log("Shares sold successfully.");
    console.log(`Current supply: ${creatorAccount.currentSupply.toNumber()}`);
    console.log(
      `Trader received: ${
        (traderBalanceAfter - traderBalanceBefore) / LAMPORTS_PER_SOL
      } SOL`
    );
    console.log(
      `Creator earned: ${
        (creatorBalanceAfter - creatorBalanceBefore) / LAMPORTS_PER_SOL
      } SOL`
    );
    console.log(
      `Contract paid: ${
        (contractBalanceBefore - contractBalanceAfter) / LAMPORTS_PER_SOL
      } SOL`
    );
  });
});
