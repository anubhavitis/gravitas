import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Gravitas } from "../target/types/gravitas";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  createMint,
  mintTo,
  transfer,
  getOrCreateAssociatedTokenAccount,
  Account,
} from "@solana/spl-token";
import { expect } from "chai";

describe("gravitas", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Gravitas as Program<Gravitas>;

  let user: Keypair;
  let creator: Keypair;

  let associatedCreatorTokenAccount: Account;
  let associatedUserTokenAccount: Account;

  let eventId: number;
  let eventPda: PublicKey;
  let tokenMint: PublicKey;

  async function getFundedKeypair(): Promise<Keypair> {
    const obj = anchor.web3.Keypair.generate();

    let fundObj = await provider.connection.requestAirdrop(
      obj.publicKey,
      1000000000
    );
    await provider.connection.confirmTransaction(fundObj);
    return obj;
  }

  before(async () => {
    // Generate a random event ID between 0 and 999999
    eventId = Math.floor(Math.random() * 1000000);

    // Create a new Solana keypair for the user
    creator = await getFundedKeypair();
    console.log("Funded creator account", creator.publicKey.toBase58());

    user = await getFundedKeypair();
    console.log("Funded user account");

    // Create a token mint
    tokenMint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      9
    );

    console.log("Token mint created", tokenMint.toString());

    associatedCreatorTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      tokenMint,
      creator.publicKey
    );

    console.log(
      "associated creator token account created: ",
      associatedCreatorTokenAccount.address.toBase58()
    );

    await mintTo(
      provider.connection,
      creator,
      tokenMint,
      associatedCreatorTokenAccount.address,
      creator,
      1000000
    );

    console.log("tokens minted to associated creator token account");

    associatedUserTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      tokenMint,
      user.publicKey
    );

    await transfer(
      provider.connection,
      creator,
      associatedCreatorTokenAccount.address,
      associatedUserTokenAccount.address,
      creator,
      50000
    );

    console.log("Transfer complete");
  });

  it("Creates an event", async () => {
    // Generate the PDA for the event account
    [eventPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("event"),
        creator.publicKey.toBuffer(),
        new anchor.BN(eventId).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const name = "Test Event";
    const description = "This is a test event";
    const startTime = Math.floor(Date.now() / 1000); // Current timestamp in seconds
    const endTime = startTime + 3600; // Event ends in 1 hour
    const requiredTokenAmount = new anchor.BN(1000); // 1000 tokens required
    const maxCapacity = 100;

    try {
      const tx = await program.methods
        .createEvent(
          new anchor.BN(eventId),
          name,
          description,
          new anchor.BN(startTime),
          new anchor.BN(endTime),
          requiredTokenAmount,
          maxCapacity
        )
        .accounts({
          creator: creator.publicKey,
          tokenMint: tokenMint,
        })
        .signers([creator])
        .rpc();

      // Fetch the created event account
      const eventAccount = await program.account.event.fetch(eventPda);
      console.log("Event Account: ", eventAccount);

      // Assert that the event details are correct
      expect(eventAccount.creator.toString()).to.equal(
        creator.publicKey.toString()
      );
      expect(eventAccount.eventId.toNumber()).to.equal(eventId);
      expect(eventAccount.name).to.equal(name);
      expect(eventAccount.description).to.equal(description);
      expect(eventAccount.startTime.toNumber()).to.equal(startTime);
      expect(eventAccount.endTime.toNumber()).to.equal(endTime);
      expect(eventAccount.requiredTokenMint.toString()).to.equal(
        tokenMint.toString()
      );
      expect(eventAccount.requiredTokenAmount.toNumber()).to.equal(
        requiredTokenAmount.toNumber()
      );
      expect(eventAccount.isActive).to.be.true;
      expect(eventAccount.maxCapacity).to.equal(maxCapacity);
      expect(eventAccount.participants).to.be.empty;
    } catch (error) {
      console.error("Error creating event:", error);
      throw error;
    }
  });

  it("Registers a user for the event", async () => {
    // Ensure we have the correct eventPda from the previous test
    console.log("Event PDA:", eventPda.toString());

    try {
      // Get the latest event data
      const eventBefore = await program.account.event.fetch(eventPda);
      console.log("Participants before:", eventBefore.participants.length);

      // Register the user for the event
      const tx = await program.methods
        .registerForEvent()
        .accounts({
          event: eventPda,
          user: user.publicKey,
          userTokenAccount: associatedUserTokenAccount.address,
          // tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      console.log("User registered with transaction signature", tx);

      // Fetch the updated event account
      const eventAfter = await program.account.event.fetch(eventPda);
      console.log("Participants after:", eventAfter.participants.length);

      // Assertions
      expect(eventAfter.participants.length).to.equal(
        eventBefore.participants.length + 1
      );
      expect(
        eventAfter.participants[eventAfter.participants.length - 1].toString()
      ).to.equal(user.publicKey.toString());
    } catch (error) {
      console.error("Error registering for event:", error);
      throw error;
    }
  });

  it("Fails to register the same user twice", async () => {
    try {
      await program.methods
        .registerForEvent()
        .accounts({
          event: eventPda,
          user: user.publicKey,
          userTokenAccount: associatedUserTokenAccount.address,
          // tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      // If we reach here, the second registration didn't throw an error as expected
      expect.fail("User was able to register twice, but shouldn't have been.");
    } catch (error) {
      expect(error.message).to.include("AlreadyRegistered");
    }
  });

  it("Cancels the event", async () => {
    await program.methods
      .cancelEvent()
      .accounts({
        event: eventPda,
        creator: creator.publicKey,
      })
      .signers([creator])
      .rpc();

    const eventAccount = await program.account.event.fetch(eventPda);
    expect(eventAccount.isActive).to.be.false;
  });

  it("Non-Creator cancels the event", async () => {
    try {
      const tx = await program.methods
        .cancelEvent()
        .accounts({
          event: eventPda,
          creator: creator.publicKey,
        })
        .signers([user])
        .rpc();

      expect.fail("");
    } catch (error) {
      console.log("error is ", error);
      expect(error.message).to.include("unknown signer");
    }
  });

  it("Fails to register for a cancelled event", async () => {
    try {
      await program.methods
        .registerForEvent()
        .accounts({
          event: eventPda,
          user: user.publicKey,
          userTokenAccount: associatedUserTokenAccount.address, // Using the same token account for simplicity
          // tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error.message).to.include("EventNotActive");
    }
  });
});
