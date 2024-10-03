import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Gravitas } from "../target/types/gravitas";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  createAssociatedTokenAccount,
  transfer,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("gravitas", () => {
  /*
  Admin user
  - fund the admin user account
  - create a token mint
  - create a token account for the admin user
  - mint some tokens to the admin user
  test user

  - Admin user creates the event
  - test user registers for the event
  - test user tries to register again and fails since already registered
  - Admin user cancels the event
  - test user tries to register for the event again and fails since event is cancelled

  */

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Gravitas as Program<Gravitas>;

  let user: Keypair;
  let creator: Keypair;
  let userTokenAccount: PublicKey;
  let creatorTokenAccount: PublicKey;

  let eventId: number;
  let eventPda: PublicKey;
  let tokenMint: PublicKey;

  before(async () => {
    // Generate a random event ID between 0 and 999999
    eventId = Math.floor(Math.random() * 1000000);

    // Create a new Solana keypair for the user
    creator = anchor.web3.Keypair.generate();

    let fundCreator = await provider.connection.requestAirdrop(
      creator.publicKey,
      1000000000
    );
    await provider.connection.confirmTransaction(fundCreator);
    console.log("Funded creator account", fundCreator);

    // Create a token mint
    tokenMint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      9
    );
    console.log("Token mint created", tokenMint.toString());

    // Create a token account for the creator
    creatorTokenAccount = await createAccount(
      provider.connection,
      creator,
      tokenMint,
      creator.publicKey
    );

    console.log(
      "Creator token account created",
      creatorTokenAccount.toString()
    );

    // create associatedTokenAccount
    const associatedCreatorTokenAccount =
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        tokenMint,
        creator.publicKey
      );

    console.log(
      "Associated token account created",
      associatedCreatorTokenAccount.toString()
    );

    // ######
    // User Setup
    // #########
    user = anchor.web3.Keypair.generate();

    // fund user and creator account
    let fundUser = await provider.connection.requestAirdrop(
      user.publicKey,
      1000000000
    );
    await provider.connection.confirmTransaction(fundUser);
    console.log("Funded user account", fundUser);

    userTokenAccount = await createAccount(
      provider.connection,
      user,
      tokenMint,
      user.publicKey
    );
    console.log("User token account created", userTokenAccount.toString());

    const associatedUserTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      tokenMint,
      user.publicKey
    );
    console.log(
      "User associated token account created",
      associatedUserTokenAccount.toString()
    );

    // Mint token
    const mintTokenSignature = await mintTo(
      provider.connection,
      creator,
      tokenMint,
      creatorTokenAccount,
      creator,
      100000000
    );

    console.log("Minted tokens", mintTokenSignature.toString());

    // // tranfer token to user
    const tranferTokenSignature = await transfer(
      provider.connection,
      creator,
      creatorTokenAccount,
      userTokenAccount,
      creator,
      100000
    );

    console.log("Transferred tokens", tranferTokenSignature.toString());
  });

  it("Creates an event", async () => {
    // Generate the PDA for the event account
    [eventPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("event"),
        creator.publicKey.toBuffer(),
        Buffer.from(eventId.toString()),
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
      console.log("system program id", SystemProgram.programId.toString());
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
          // @ts-ignore
          // event: eventPda,
          creator: creator.publicKey,
          tokenMint: tokenMint,
          // systemProgram: SystemProgram.,
        })
        .signers([creator])
        .rpc();

      // Confirm the transaction
      await provider.connection.confirmTransaction(tx);

      // Add a small delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log("Event created with transaction signature", tx);

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
  /*
  it("Registers a user for the event", async () => {
    await program.methods
      .registerForEvent()
      .accounts({
        event: eventPda,
        user: user.publicKey,
        userTokenAccount: userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const eventAccount = await program.account.event.fetch(eventPda);
    expect(eventAccount.participants).to.include(user.publicKey);
  });

  it("Fails to register the same user twice", async () => {
    try {
      await program.methods
        .registerForEvent()
        .accounts({
          event: eventPda,
          user: user.publicKey,
          userTokenAccount: userTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error.message).to.include("AlreadyRegistered");
    }
  });

  it("Cancels the event", async () => {
    await program.methods
      .cancelEvent()
      .accounts({
        event: eventPda,
        creator: provider.wallet.publicKey,
      })
      .rpc();

    const eventAccount = await program.account.event.fetch(eventPda);
    expect(eventAccount.isActive).to.be.false;
  });

  it("Fails to register for a cancelled event", async () => {
    const newUser = anchor.web3.Keypair.generate();
    try {
      await program.methods
        .registerForEvent()
        .accounts({
          event: eventPda,
          user: newUser.publicKey,
          userTokenAccount: userTokenAccount, // Using the same token account for simplicity
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([newUser])
        .rpc();
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error.message).to.include("EventNotActive");
    }
  });
*/
});
