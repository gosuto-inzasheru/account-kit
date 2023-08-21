import { expect } from "chai";
import hre from "hardhat";

import { ISafe__factory } from "../typechain-types";

import { fork, forkReset } from "./setup";
import { populateAccountCreationTransaction, predictSafeAddress } from "../src";

describe("accountCreation", async () => {
  before(async () => {
    await fork(17741542);
  });

  after(async () => {
    await forkReset();
  });

  it("sets up a 1/1 safe", async () => {
    const [owner, , , other] = await hre.ethers.getSigners();

    const predictedAccountAddress = predictSafeAddress(owner.address);

    // account not deployed
    expect(await hre.ethers.provider.getCode(predictedAccountAddress)).to.equal(
      "0x"
    );

    const { to, data } = populateAccountCreationTransaction(owner.address, 1);

    await other.sendTransaction({ to, data });

    // account deployed
    expect(
      await hre.ethers.provider.getCode(predictedAccountAddress)
    ).to.not.equal("0x");

    const safe = ISafe__factory.connect(
      predictedAccountAddress,
      hre.ethers.provider
    );
    expect(await safe.isOwner(owner.address)).to.be.true;
    expect(await safe.isOwner(other.address)).to.be.false;
  });
});