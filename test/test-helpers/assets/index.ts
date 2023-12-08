import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import deployDelay from "./delay";
import deployFallbackHandler from "./fallbackHandler";
import deployModuleProxyFactory from "./moduleProxyFactory";
import deployMulticall from "./multicall";
import deployMultisend from "./multisend";
import deployRoles from "./roles";
import deploySafeMastercopy from "./safeMastercopy";
import deploySafeProxyFactory from "./safeProxyFactory";
import deploySpender from "./spender";
import { deployFactory as deploy2470Factory } from "../factories/eip2470";
import { deployFactory as deployNickFactory } from "../factories/nickSingletonFactory";
import { deployFactory as deploySafeFactory } from "../factories/safeSingletonFactory";

export default async function (signer: SignerWithAddress) {
  await deploy2470Factory(signer);
  await deployNickFactory(signer);
  await deploySafeFactory(signer);

  await deployDelay(signer);
  await deployFallbackHandler(signer);
  await deployModuleProxyFactory(signer);
  await deployMulticall(signer);
  await deployMultisend(signer);
  await deployRoles(signer);
  await deploySpender(signer);
  await deploySafeMastercopy(signer);
  await deploySafeProxyFactory(signer);
}
