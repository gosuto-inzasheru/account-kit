import { getAddress } from "ethers";
import { ACCOUNT_CREATION_NONCE, SPENDER_CREATION_NONCE } from "../constants";
import {
  _predictSafeAddress,
  predictBouncerAddress,
  predictDelayModAddress,
  predictRolesModAddress,
} from "../parts";

type AccountCreationParameters = {
  /**
   * The owner for the account. Will be the sole signer on the resulting safe
   */
  owner: string;
  /**
   * Optional parameter. The nonce used on safe proxy creation. To be left
   * blank as the default value is the expect value for Gnosis Pay accounts
   *
   */
  creationNonce?: bigint;
};

type SpenderCreationParameters = {
  /**
   * The address of the owner EOA
   */
  owners: string[];
  /*
   * ID associated with the current network.
   */
  threshold: number;
  /*
   * The current nonce value of the Safe that is to be configured
   */
  creationNonce?: bigint;
};

/**
 * Calculates the address of the account will be (or was) created by relaying
 * the output of populateAccountCreation.
 *
 * @param parameters - {@link AccountCreationParameters}
 * @returns The address of the resulting safe
 *
 * @example
 * import { predictAccountAddress } from "@gnosispay/account-kit";
 *
 * const account = predictAccountAddress({
 *    owner: "0x0000000000000000000000000123456789abcdef";
 * });
 *
 * // It is also possible to provide a custom creationNonce
 * // (however should be left blank, the default is correct configuration)
 *
 * const account = predictAccountAddress({
 *    owner: "0x0000000000000000000000000123456789abcdef",
 *    creationNonce: 987654321123456789n
 * });
 *
 */
export function predictAccountAddress({
  owner,
  creationNonce = ACCOUNT_CREATION_NONCE,
}: AccountCreationParameters): string {
  owner = getAddress(owner);

  return _predictSafeAddress({ owners: [owner], creationNonce });
}

export function predictSpenderAddress({
  owners,
  threshold,
  creationNonce = SPENDER_CREATION_NONCE,
}: SpenderCreationParameters): string {
  return _predictSafeAddress({ owners, threshold, creationNonce });
}

export function predictAddresses({
  owner,
  creationNonce = ACCOUNT_CREATION_NONCE,
}: AccountCreationParameters) {
  owner = getAddress(owner);
  const account = predictAccountAddress({ owner, creationNonce });

  return {
    account,
    bouncer: predictBouncerAddress(account),
    delay: predictDelayModAddress(account),
    roles: predictRolesModAddress(account),
  };
}
