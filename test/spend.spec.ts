import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";

import {
  GNO,
  GNO_WHALE,
  createAccountConfig,
  fork,
  forkReset,
  moveERC20,
} from "./test-helpers/setup";

import {
  populateAccountCreation,
  populateAccountSetup,
  populateSpend,
  predictAccountAddress,
} from "../src";

import { IERC20__factory } from "../typechain-types";

describe("spend", () => {
  before(async () => {
    await fork(29800000);
  });

  after(async () => {
    await forkReset();
  });

  async function createAccount() {
    const [owner, spender, receiver, relayer] = await hre.ethers.getSigners();

    const account = predictAccountAddress(owner.address);
    const createTransaction = populateAccountCreation(owner.address);

    await relayer.sendTransaction(createTransaction);

    await moveERC20(GNO_WHALE, account, GNO);

    const config = createAccountConfig({
      spender: spender.address,
      receiver: receiver.address,
      token: GNO,
      allowance: 1000,
    });

    const setupTransaction = await populateAccountSetup(
      { owner: owner.address, account, chainId: 31337, nonce: 0 },
      config,
      (domain, types, message) => owner.signTypedData(domain, types, message)
    );

    await relayer.sendTransaction(setupTransaction);

    return {
      account,
      owner,
      spender,
      receiver,
      relayer,
    };
  }

  it("enforces configured spender as signer on spend tx", async () => {
    const { account, spender, receiver, relayer } =
      await loadFixture(createAccount);

    const gno = IERC20__factory.connect(GNO, hre.ethers.provider);

    const token = GNO;
    const to = receiver.address;
    const amount = 10;

    const spendSignedByOther = await populateSpend(
      { account, spender: spender.address, chainId: 31337, nonce: 0 },
      { token, to, amount },
      (...args) => relayer.signTypedData(...args)
    );
    const spendSignedBySpender = await populateSpend(
      { account, spender: spender.address, chainId: 31337, nonce: 0 },
      { token, to, amount },
      (...args) => spender.signTypedData(...args)
    );

    await expect(relayer.sendTransaction(spendSignedByOther)).to.be.reverted;
    expect(await gno.balanceOf(to)).to.be.equal(0);

    // only spender can execute the allowance transfer
    await spender.sendTransaction(spendSignedBySpender);
    expect(await gno.balanceOf(to)).to.be.equal(amount);
  });

  it("enforces configured receiver as to on spend tx", async () => {
    const { account, spender, receiver, relayer } =
      await loadFixture(createAccount);

    const gno = IERC20__factory.connect(GNO, hre.ethers.provider);

    const token = GNO;
    const amount = 10;

    const txToOther = await populateSpend(
      { account, spender: spender.address, chainId: 31337, nonce: 0 },
      { token, to: relayer.address, amount },
      (...args) => spender.signTypedData(...args)
    );

    const txToReceiver = await populateSpend(
      { account, spender: spender.address, chainId: 31337, nonce: 0 },
      { token, to: receiver.address, amount },
      (...args) => spender.signTypedData(...args)
    );

    // since we don't provide signature, the spender must be the sender:
    await expect(spender.sendTransaction(txToOther)).to.be.reverted;
    expect(await gno.balanceOf(receiver.address)).to.be.equal(0);

    // only spender can execute the allowance transfer
    await spender.sendTransaction(txToReceiver);
    expect(await gno.balanceOf(receiver.address)).to.be.equal(amount);
  });

  it("spend overusing allowance fails", async () => {
    const { account, spender, receiver } = await loadFixture(createAccount);

    const gno = IERC20__factory.connect(GNO, hre.ethers.provider);

    const token = GNO;
    const amount = 2000;

    const txToReceiver = await populateSpend(
      { account, spender: spender.address, chainId: 31337, nonce: 0 },
      { token, to: receiver.address, amount },
      (...args) => spender.signTypedData(...args)
    );

    expect(await gno.balanceOf(receiver.address)).to.be.equal(0);
    await expect(spender.sendTransaction(txToReceiver)).to.be.reverted;
  });
});
