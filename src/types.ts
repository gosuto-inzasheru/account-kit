export enum OperationType {
  Call = 0,
  DelegateCall = 1,
}

export interface TransactionData {
  to: string;
  value?: bigint | number;
  data: string;
}

export interface SafeTransactionData {
  to: string;
  value: bigint | number;
  data: string;
  operation: OperationType;
}

export type ExecutionConfig = {
  account: string;
  chainId: bigint | number;
  nonce: bigint | number;
};

export type AccountConfig = {
  owner: string; // the owner of the account
  //** for allowance mod **/
  spender: string; // the gnosis signer, which will be enabled via allowance
  token: string; // the address of the token used for payments
  amount: bigint | number; // the allowance amount granted to spender
  period: number; // period after which an allowance will be replenished (IN MINUTES)
  //** for delay mod **/
  cooldown: number; // execution delay for owner before he execute transactions (IN SECONDS)
};

export enum AccountIntegrityStatus {
  Ok,
  SafeNotDeployed,
  SafeMisconfigured,
  AllowanceMisconfigured,
  DelayNotDeployed,
  DelayMisconfigured,
  DelayQueueNotEmpty,
  UnexpectedError,
}

export type Transfer = {
  token: string;
  to: string;
  amount: bigint | number;
};

export type AllowanceTransfer = {
  spender: string;
  token: string;
  to: string;
  amount: bigint | number;
};
