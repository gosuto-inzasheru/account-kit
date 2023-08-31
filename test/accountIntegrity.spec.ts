import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import hre from "hardhat";

import execSafeTransaction from "./test-helpers/execSafeTransaction";
import {
  DAI,
  DAI_WHALE,
  createAccountConfig,
  fork,
  forkReset,
  moveERC20,
} from "./test-helpers/setup";
import {
  populateAccountCreation,
  populateAccountSetup,
  populateAllowanceTransfer,
  predictDelayAddress,
  predictSafeAddress,
  populateAccountIntegrityQuery,
  evaluateAccountIntegrityResult,
} from "../src";
import deployments from "../src/deployments";
import { AccountIntegrityStatus } from "../src/types";
import { IDelayModule__factory, ISafe__factory } from "../typechain-types";

const AddressOne = "0x0000000000000000000000000000000000000001";
const AddressOther = "0x0000000000000000000000000000000000000009";

describe("account-integrity", () => {
  before(async () => {
    await fork(17741542);
  });

  after(async () => {
    await forkReset();
  });

  async function setupAccount() {
    const [owner, , , alice, bob, relayer] = await hre.ethers.getSigners();

    const safeAddress = predictSafeAddress(owner.address);
    await moveERC20(DAI_WHALE, safeAddress, DAI);

    await relayer.sendTransaction(populateAccountCreation(owner.address));

    const accountConfig = createAccountConfig({
      owner: owner.address,
      spender: alice.address,
      period: 7654,
      token: DAI,
      amount: 123,
    });

    const transaction = await populateAccountSetup(
      { safe: safeAddress, chainId: 31337, nonce: 0 },
      accountConfig,
      (domain, types, message) => owner.signTypedData(domain, types, message)
    );

    await relayer.sendTransaction(transaction);

    return {
      owner,
      alice,
      bob,
      relayer,
      safeAddress: safeAddress,
      config: accountConfig,
    };
  }

  it("passes for a well configured account", async () => {
    const { safeAddress, config } = await loadFixture(setupAccount);
    const provider = hre.ethers.provider;

    const data = populateAccountIntegrityQuery(safeAddress, config);

    const resultData = await provider.send("eth_call", [
      {
        from: null,
        to: deployments.multicall.address,
        data,
      },
    ]);

    const result = await evaluateAccountIntegrityResult(
      resultData,
      safeAddress,
      config
    );

    expect(result.status).to.equal(AccountIntegrityStatus.Ok);
    expect(result.allowance?.amount).to.equal(config.amount);
    expect(result.allowance?.nonce).to.equal(1);
  });

  it("passes and reflects recent spending on the result", async () => {
    const { safeAddress, alice, relayer, config } =
      await loadFixture(setupAccount);
    const provider = hre.ethers.provider;

    const query = populateAccountIntegrityQuery(safeAddress, config);

    let resultData = await provider.send("eth_call", [
      {
        from: null,
        to: deployments.multicall.address,
        data: query,
      },
    ]);

    let result = await evaluateAccountIntegrityResult(
      resultData,
      safeAddress,
      config
    );
    expect(result.status).to.equal(AccountIntegrityStatus.Ok);
    expect(result.allowance?.amount).to.equal(config.amount);
    expect(result.allowance?.nonce).to.equal(1);

    const justSpent = 23;
    const transaction = await populateAllowanceTransfer(
      { safe: safeAddress, chainId: 31337, nonce: 1 },
      {
        spender: alice.address,
        token: DAI,
        to: ZeroAddress,
        amount: justSpent,
      },
      (message) => alice.signMessage(message)
    );
    await relayer.sendTransaction(transaction);

    // run the query again, expect it to reflect the used amount
    resultData = await provider.send("eth_call", [
      {
        from: null,
        to: deployments.multicall.address,
        data: query,
      },
    ]);

    result = await evaluateAccountIntegrityResult(
      resultData,
      safeAddress,
      config
    );
    expect(result.status).to.equal(AccountIntegrityStatus.Ok);
    expect(result.allowance?.amount).to.equal(
      Number(config.amount) - justSpent
    );
    expect(result.allowance?.nonce).to.equal(2);
  });

  it("fails when the number of modules enabled is not two", async () => {
    const { safeAddress, owner, relayer, config } =
      await loadFixture(setupAccount);
    const provider = hre.ethers.provider;

    const safe = ISafe__factory.connect(safeAddress, relayer);

    await execSafeTransaction(
      safe,
      await safe.enableModule.populateTransaction(
        "0x0000000000000000000000000000000000000009"
      ),
      owner
    );

    const query = populateAccountIntegrityQuery(safeAddress, config);

    const resultData = await provider.send("eth_call", [
      {
        from: null,
        to: deployments.multicall.address,
        data: query,
      },
    ]);

    const result = await evaluateAccountIntegrityResult(
      resultData,
      safeAddress,
      config
    );
    expect(result.status).to.equal(AccountIntegrityStatus.SafeMisconfigured);
  });

  it("fails when allowance module is not enabled", async () => {
    const { safeAddress, owner, relayer, config } =
      await loadFixture(setupAccount);
    const provider = hre.ethers.provider;

    const safe = ISafe__factory.connect(safeAddress, relayer);
    const allowanceAddress = deployments.allowanceSingleton.address;
    const delayAddress = predictDelayAddress(safeAddress);

    await execSafeTransaction(
      safe,
      await safe.disableModule.populateTransaction(
        delayAddress,
        allowanceAddress
      ),
      owner
    );

    await execSafeTransaction(
      safe,
      await safe.enableModule.populateTransaction(AddressOther),
      owner
    );

    const query = populateAccountIntegrityQuery(safeAddress, config);

    const resultData = await provider.send("eth_call", [
      {
        from: null,
        to: deployments.multicall.address,
        data: query,
      },
    ]);

    const result = await evaluateAccountIntegrityResult(
      resultData,
      safeAddress,
      config
    );
    expect(result.status).to.equal(AccountIntegrityStatus.SafeMisconfigured);
  });

  it("fails when delay module is not enabled", async () => {
    const { safeAddress, owner, relayer, config } =
      await loadFixture(setupAccount);
    const provider = hre.ethers.provider;

    const safe = ISafe__factory.connect(safeAddress, relayer);
    const delayAddress = predictDelayAddress(safeAddress);

    await execSafeTransaction(
      safe,
      await safe.disableModule.populateTransaction(AddressOne, delayAddress),
      owner
    );

    await execSafeTransaction(
      safe,
      await safe.enableModule.populateTransaction(AddressOther),
      owner
    );

    const query = populateAccountIntegrityQuery(safeAddress, config);

    const resultData = await provider.send("eth_call", [
      {
        from: null,
        to: deployments.multicall.address,
        data: query,
      },
    ]);

    const result = await evaluateAccountIntegrityResult(
      resultData,
      safeAddress,
      config
    );
    expect(result.status).to.equal(AccountIntegrityStatus.SafeMisconfigured);
  });

  it("fails when cooldown is too short", async () => {
    const { safeAddress, owner, relayer, config } =
      await loadFixture(setupAccount);

    const delayAddress = predictDelayAddress(safeAddress);

    const safe = ISafe__factory.connect(safeAddress, relayer);
    const delay = IDelayModule__factory.connect(delayAddress, relayer);

    const query = populateAccountIntegrityQuery(safeAddress, config);

    await execSafeTransaction(
      safe,
      await delay.setTxCooldown.populateTransaction(5),
      owner
    );

    const resultData = await hre.ethers.provider.send("eth_call", [
      {
        from: null,
        to: deployments.multicall.address,
        data: query,
      },
    ]);

    const result = await evaluateAccountIntegrityResult(
      resultData,
      safeAddress,
      config
    );
    expect(result.status).to.equal(AccountIntegrityStatus.DelayMisconfigured);
  });

  it("fails when queue is not empty", async () => {
    const { safeAddress, owner, config } = await loadFixture(setupAccount);

    const delayAddress = predictDelayAddress(safeAddress);
    const delay = IDelayModule__factory.connect(delayAddress, owner);

    const integrityQuery = populateAccountIntegrityQuery(safeAddress, config);

    let resultData = await hre.ethers.provider.send("eth_call", [
      {
        from: null,
        to: deployments.multicall.address,
        data: integrityQuery,
      },
    ]);

    let result = await evaluateAccountIntegrityResult(
      resultData,
      safeAddress,
      config
    );
    // everything is alright
    expect(result.status).to.equal(AccountIntegrityStatus.Ok);

    // enqueue a via delay
    await delay.execTransactionFromModule(AddressOther, 0, "0x", 0);

    resultData = await hre.ethers.provider.send("eth_call", [
      {
        from: null,
        to: deployments.multicall.address,
        data: integrityQuery,
      },
    ]);

    result = await evaluateAccountIntegrityResult(
      resultData,
      safeAddress,
      config
    );
    // integrity fails
    expect(result.status).to.equal(AccountIntegrityStatus.DelayQueueNotEmpty);
  });
});
