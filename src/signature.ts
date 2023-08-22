import { SafeTransactionData } from "./types";

import { predictSafeAddress } from "./populate/accountCreation";

const AddressZero = "0x0000000000000000000000000000000000000000";

/*
 * produces the parameters to be passed to signer_signTypedData()
 */

export default function signSafeTransactionParams(
  ownerAccount: string,
  chainId: number,
  { to, value, data, operation }: SafeTransactionData,
  nonce: bigint | number
) {
  const safeAddress = predictSafeAddress(ownerAccount);

  const domain = { verifyingContract: safeAddress, chainId };
  const primaryType = "SafeTx" as const;
  const types = {
    SafeTx: [
      { type: "address", name: "to" },
      { type: "uint256", name: "value" },
      { type: "bytes", name: "data" },
      { type: "uint8", name: "operation" },
      { type: "uint256", name: "safeTxGas" },
      { type: "uint256", name: "baseGas" },
      { type: "uint256", name: "gasPrice" },
      { type: "address", name: "gasToken" },
      { type: "address", name: "refundReceiver" },
      { type: "uint256", name: "nonce" },
    ],
  };
  const message = {
    to,
    value,
    data,
    operation,
    safeTxGas: 0,
    baseGas: 0,
    gasPrice: 0,
    gasToken: AddressZero,
    refundReceiver: AddressZero,
    nonce,
  };

  return { account: ownerAccount, domain, primaryType, types, message };
}