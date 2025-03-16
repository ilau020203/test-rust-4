import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RustTest4 } from "../target/types/rust_test_4";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

describe("rust-test-4", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.RustTest4 as Program<RustTest4>;
  
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId
  );

  it("Initialize vault", async () => {
    const tx = await program.methods
      .initializeVault()
      .accounts({
        authority: provider.wallet.publicKey,
      })
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPDA);
    expect(vaultAccount.authority.toString()).to.equal(provider.wallet.publicKey.toString());
    expect(vaultAccount.totalBalance.toNumber()).to.equal(0);
  });

  it("Initialize user deposit", async () => {
    const [userDepositPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .initializeDeposit()
      .accounts({
        user: provider.wallet.publicKey,
      })
      .rpc();

    const userDepositAccount = await program.account.userDeposit.fetch(userDepositPDA);
    expect(userDepositAccount.owner.toString()).to.equal(provider.wallet.publicKey.toString());
    expect(userDepositAccount.balance.toNumber()).to.equal(0);
  });

  it("Make deposit", async () => {
    const [userDepositPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    const depositAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);
    
    const balanceBefore = await provider.connection.getBalance(vaultPDA);

    const tx = await program.methods
      .deposit(depositAmount)
      .accounts({
        user: provider.wallet.publicKey,
      })
      .rpc();

    const balanceAfter = await provider.connection.getBalance(vaultPDA);
    expect(balanceAfter - balanceBefore).to.equal(depositAmount.toNumber());

    const vaultAccount = await program.account.vault.fetch(vaultPDA);
    const userDepositAccount = await program.account.userDeposit.fetch(userDepositPDA);
    
    expect(vaultAccount.totalBalance.toNumber()).to.equal(depositAmount.toNumber());
    expect(userDepositAccount.balance.toNumber()).to.equal(depositAmount.toNumber());
  });

  it("Withdraw funds", async () => {
    const [userDepositPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    const withdrawAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);
    
    const userBalanceBefore = await provider.connection.getBalance(provider.wallet.publicKey);
    const vaultBalanceBefore = await provider.connection.getBalance(vaultPDA);

    const tx = await program.methods
      .withdraw(withdrawAmount)
      .accounts({
        user: provider.wallet.publicKey,
      })
      .rpc();

    const userBalanceAfter = await provider.connection.getBalance(provider.wallet.publicKey);
    const vaultBalanceAfter = await provider.connection.getBalance(vaultPDA);

    expect(userBalanceAfter).to.be.above(userBalanceBefore);
    expect(vaultBalanceBefore - vaultBalanceAfter).to.equal(withdrawAmount.toNumber());

    const vaultAccount = await program.account.vault.fetch(vaultPDA);
    const userDepositAccount = await program.account.userDeposit.fetch(userDepositPDA);
    
    expect(vaultAccount.totalBalance.toNumber()).to.equal(0.5 * LAMPORTS_PER_SOL);
    expect(userDepositAccount.balance.toNumber()).to.equal(0.5 * LAMPORTS_PER_SOL);
  });

  it("Multiple users can deposit and withdraw", async () => {
    const initialVaultAccount = await program.account.vault.fetch(vaultPDA);
    const initialBalance = initialVaultAccount.totalBalance.toNumber();

    const users = Array(3).fill(0).map(() => anchor.web3.Keypair.generate());
    
    for (const user of users) {
      const signature = await provider.connection.requestAirdrop(
        user.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(signature);
    }

    for (const user of users) {
      await program.methods
        .initializeDeposit()
        .accounts({
          user: user.publicKey,
        })
        .signers([user])
        .rpc();

      await program.methods
        .deposit(new anchor.BN(1 * LAMPORTS_PER_SOL))
        .accounts({
          user: user.publicKey,
        })
        .signers([user])
        .rpc();
    }

    const vaultAccount = await program.account.vault.fetch(vaultPDA);
    expect(vaultAccount.totalBalance.toNumber()).to.equal(initialBalance + (3 * LAMPORTS_PER_SOL));

    for (const user of users) {
      const [userDepositPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("deposit"), user.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .withdraw(new anchor.BN(0.5 * LAMPORTS_PER_SOL))
        .accounts({
          user: user.publicKey,
        })
        .signers([user])
        .rpc();

      const userDeposit = await program.account.userDeposit.fetch(userDepositPDA);
      expect(userDeposit.balance.toNumber()).to.equal(0.5 * LAMPORTS_PER_SOL);
    }

    const finalVaultAccount = await program.account.vault.fetch(vaultPDA);
    expect(finalVaultAccount.totalBalance.toNumber()).to.equal(initialBalance + (1.5 * LAMPORTS_PER_SOL));
  });

  describe("Error checks", () => {
    it("Should fail when trying to withdraw more than balance", async () => {
      const largeAmount = new anchor.BN(100 * LAMPORTS_PER_SOL);

      try {
        await program.methods
          .withdraw(largeAmount)
          .accounts({
            user: provider.wallet.publicKey,
          })
          .rpc();
        expect.fail("Should throw an error");
      } catch (error: any) {
        console.log("Error 1:", error);
        expect(error.error.errorCode.code).to.equal("InsufficientFunds");
      }
    });
  });
});
