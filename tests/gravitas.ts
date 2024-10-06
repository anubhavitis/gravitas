import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Gravitas } from "../target/types/gravitas";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  transfer,
  getOrCreateAssociatedTokenAccount,
  Account,
  getTokenMetadata,
  TYPE_SIZE,
  LENGTH_SIZE,
  getMintLen,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
} from "@solana/spl-token";
import { expect } from "chai";
import {
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
  TokenMetadata,
} from "@solana/spl-token-metadata";

describe("gravitas", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Gravitas as Program<Gravitas>;

  let admin: Keypair;
  let helper: Keypair;

  let associatedAdminAccount: Account;
  let associatedHelperAccount: Account;

  let eventId: number;
  let eventPda: PublicKey;
  let mint: PublicKey;

  async function getFundedKeypair(): Promise<Keypair> {
    const obj = anchor.web3.Keypair.generate();

    let fundObj = await provider.connection.requestAirdrop(
      obj.publicKey,
      1000000000
    );
    await provider.connection.confirmTransaction(fundObj);
    return obj;
  }

  async function testNewScript() {
    admin = await getFundedKeypair();
    // Generate new keypair for Mint Account
    const mintKeypair = Keypair.generate();
    // Address for Mint Account
    mint = mintKeypair.publicKey;
    // Decimals for Mint Account
    const decimals = 2;
    // Authority that can mint new tokens
    const mintAuthority = admin.publicKey;
    // Authority that can update the metadata pointer and token metadata
    const updateAuthority = admin.publicKey;

    // Metadata to store in Mint Account
    const metaData: TokenMetadata = {
      updateAuthority: updateAuthority,
      mint: mint,
      name: "TEST GRAVITAS",
      symbol: "TGS",
      uri: "https://github.com/user-attachments/files/17265711/test.json",
      additionalMetadata: [["description", "Only Possible On Solana"]],
    };

    // Size of MetadataExtension 2 bytes for type, 2 bytes for length
    const metadataExtension = TYPE_SIZE + LENGTH_SIZE;
    // Size of metadata
    const metadataLen = pack(metaData).length;

    // Size of Mint Account with extension
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);

    // Minimum lamports required for Mint Account
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(
        mintLen + metadataExtension + metadataLen
      );

    // Instruction to invoke System Program to create new account
    const createAccountInstruction = SystemProgram.createAccount({
      fromPubkey: admin.publicKey, // Account that will transfer lamports to created account
      newAccountPubkey: mint, // Address of the account to create
      space: mintLen, // Amount of bytes to allocate to the created account
      lamports, // Amount of lamports transferred to created account
      programId: TOKEN_2022_PROGRAM_ID, // Program assigned as owner of created account
    });

    // Instruction to initialize the MetadataPointer Extension
    const initializeMetadataPointerInstruction =
      createInitializeMetadataPointerInstruction(
        mint, // Mint Account address
        updateAuthority, // Authority that can set the metadata address
        mint, // Account address that holds the metadata
        TOKEN_2022_PROGRAM_ID
      );

    // Instruction to initialize Mint Account data
    const initializeMintInstruction = createInitializeMintInstruction(
      mint, // Mint Account Address
      decimals, // Decimals of Mint
      mintAuthority, // Designated Mint Authority
      null, // Optional Freeze Authority
      TOKEN_2022_PROGRAM_ID // Token Extension Program ID
    );

    // Instruction to initialize Metadata Account data
    const initializeMetadataInstruction = createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID, // Token Extension Program as Metadata Program
      metadata: mint, // Account address that holds the metadata
      updateAuthority: updateAuthority, // Authority that can update the metadata
      mint: mint, // Mint Account address
      mintAuthority: mintAuthority, // Designated Mint Authority
      name: metaData.name,
      symbol: metaData.symbol,
      uri: metaData.uri,
    });

    // Instruction to update metadata, adding custom field
    const updateFieldInstruction = createUpdateFieldInstruction({
      programId: TOKEN_2022_PROGRAM_ID, // Token Extension Program as Metadata Program
      metadata: mint, // Account address that holds the metadata
      updateAuthority: updateAuthority, // Authority that can update the metadata
      field: metaData.additionalMetadata[0][0], // key
      value: metaData.additionalMetadata[0][1], // value
    });

    // Add instructions to new transaction
    const transaction = new Transaction().add(
      createAccountInstruction,
      initializeMetadataPointerInstruction,
      // note: the above instructions are required before initializing the mint
      initializeMintInstruction,
      initializeMetadataInstruction,
      updateFieldInstruction
    );

    // Send transaction
    const transactionSignature = await sendAndConfirmTransaction(
      provider.connection,
      transaction,
      [admin, mintKeypair] // Signers
    );

    console.log(
      "\nCreate Mint Account:",
      `https://solana.fm/tx/${transactionSignature}?cluster=devnet-solana`
    );

    associatedAdminAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin,
      mint,
      admin.publicKey,
      true,
      null,
      null,
      TOKEN_2022_PROGRAM_ID
    );

    console.log(
      "Found associated admin token account:",
      associatedAdminAccount.address.toBase58()
    );

    await mintTo(
      provider.connection,
      admin,
      mint,
      associatedAdminAccount.address,
      mintAuthority,
      1000000000,
      [],
      null,
      TOKEN_2022_PROGRAM_ID
    );

    console.log("MINT DONE");

    helper = await getFundedKeypair();
    associatedHelperAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      helper,
      mint,
      helper.publicKey,
      true,
      null,
      null,
      TOKEN_2022_PROGRAM_ID
    );

    console.log("Helper account created: ", helper.publicKey.toBase58());

    await transfer(
      provider.connection,
      admin,
      associatedAdminAccount.address,
      associatedHelperAccount.address,
      admin,
      5000000,
      [],
      null,
      TOKEN_2022_PROGRAM_ID
    );

    console.log("TRANSFER TO HELPER USER DONE");
  }

  before(async () => {
    // Generate a random event ID between 0 and 999999
    eventId = Math.floor(Math.random() * 1000000);

    await testNewScript();
  });

  // TODO write test case to getMetadata
  it("Gets the token metadata", async () => {
    try {
      const metadata = await getTokenMetadata(provider.connection, mint);

      console.log("Token Metadata:", metadata);

      // Assert that the metadata matches what we set earlier
      expect(metadata.name).to.equal("TEST GRAVITAS");
      expect(metadata.symbol).to.equal("TGS");
      expect(metadata.uri).to.equal(
        "https://github.com/user-attachments/files/17265711/test.json"
      );

      // Check for the additional metadata field we added
      const descriptionField = metadata.additionalMetadata.find(
        ([key]) => key === "description"
      );
      expect(descriptionField).to.not.be.undefined;
      expect(descriptionField[1]).to.equal("Only Possible On Solana");
    } catch (error) {
      console.error("Error getting token metadata:", error);
      throw error;
    }
  });

  it("Creates an event", async () => {
    // Generate the PDA for the event account
    [eventPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("event"),
        admin.publicKey.toBuffer(),
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
          creator: admin.publicKey,
          tokenMint: mint,
        })
        .signers([admin])
        .rpc();

      console.log("Hello world");
      // Fetch the created event account
      const eventAccount = await program.account.event.fetch(eventPda);
      console.log("Event Account: ", eventAccount);

      // Assert that the event details are correct
      expect(eventAccount.creator.toString()).to.equal(
        admin.publicKey.toString()
      );
      expect(eventAccount.eventId.toNumber()).to.equal(eventId);
      expect(eventAccount.name).to.equal(name);
      expect(eventAccount.description).to.equal(description);
      expect(eventAccount.startTime.toNumber()).to.equal(startTime);
      expect(eventAccount.endTime.toNumber()).to.equal(endTime);
      expect(eventAccount.requiredTokenMint.toString()).to.equal(
        mint.toString()
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
          user: helper.publicKey,
          userTokenAccount: associatedHelperAccount.address,
          // tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([helper])
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
      ).to.equal(helper.publicKey.toString());
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
          user: helper.publicKey,
          userTokenAccount: associatedHelperAccount.address,
          // tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([helper])
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
        creator: admin.publicKey,
      })
      .signers([admin])
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
          creator: admin.publicKey,
        })
        .signers([helper])
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
          user: helper.publicKey,
          userTokenAccount: associatedHelperAccount.address, // Using the same token account for simplicity
          // tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([helper])
        .rpc();
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error.message).to.include("EventNotActive");
    }
  });
});
