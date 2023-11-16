import assert from "assert";
import { AbiCoder, getAddress } from "ethers";

import { SPENDING_ALLOWANCE_KEY } from "../../constants";
import deployments from "../../deployments";
import {
  predictBouncerAddress,
  predictDelayAddress,
  predictRolesAddress,
} from "../../parts";

import {
  AccountIntegrityStatus,
  AccountQueryResult,
  TransactionRequest,
} from "../../types";

const AddressOne = "0x0000000000000000000000000000000000000001";

type AccountQueryParameters = {
  /**
   * The address of the account
   */
  account: string;
  /*
   * The expected cooldown config value (see SetupConfig)
   */
  cooldown: number;
};

/**
 * Callback that performs an eth_call for a transaction request. Output is
 * transaction returnData
 */
type EthCallCallback = (request: TransactionRequest) => Promise<string>;

/**
 * Creates a multicall payload that collects all data required to assess if a
 * given GnosisPay account passes integrity requirements. Calculates and
 * returns the accrued allowance balance
 *
 * @param parameters - {@link AccountQueryParameters}
 * @param doEthCall - {@link EthCallCallback}
 * @returns Status and Allowance information. {@link AccountQueryResult}
 *
 * @example
 * import { accountQuery } from "@gnosispay/account-kit";
 *
 * const {
 *   status,
 *   allowance: { balance, refill, period, maxRefill, nextRefill },
 * } = await accountQuery(
 *   { account, cooldown },
 *   ({ to, data }) => provider.send("eth_call", [{ to, data }])
 * );
 *
 */
export default async function accountQuery(
  { account, cooldown }: AccountQueryParameters,
  doEthCall: EthCallCallback
): Promise<AccountQueryResult> {
  account = getAddress(account);

  const request = createRequest(account);
  const resultData = await doEthCall(request);
  return evaluateResult(account, cooldown, resultData);
}

function createRequest(account: string): TransactionRequest {
  const { iface } = deployments.safeMastercopy;
  const delay = {
    address: predictDelayAddress(account),
    iface: deployments.delayMastercopy.iface,
  };
  const roles = {
    address: predictRolesAddress(account),
    iface: deployments.rolesMastercopy.iface,
  };

  const multicall = deployments.multicall;

  const data = multicall.iface.encodeFunctionData("aggregate3", [
    [
      {
        target: account,
        allowFailure: true,
        callData: iface.encodeFunctionData("getOwners"),
      },
      {
        target: account,
        allowFailure: true,
        callData: iface.encodeFunctionData("getThreshold"),
      },
      {
        target: account,
        allowFailure: true,
        callData: iface.encodeFunctionData("getModulesPaginated", [
          AddressOne,
          10,
        ]),
      },
      {
        target: roles.address,
        allowFailure: true,
        callData: roles.iface.encodeFunctionData("owner"),
      },
      {
        target: roles.address,
        allowFailure: true,
        callData: roles.iface.encodeFunctionData("allowances", [
          SPENDING_ALLOWANCE_KEY,
        ]),
      },
      {
        target: delay.address,
        allowFailure: true,
        callData: delay.iface.encodeFunctionData("owner"),
      },
      {
        target: delay.address,
        allowFailure: true,
        callData: delay.iface.encodeFunctionData("txCooldown"),
      },
      {
        target: delay.address,
        allowFailure: true,
        callData: delay.iface.encodeFunctionData("txNonce"),
      },
      {
        target: delay.address,
        allowFailure: true,
        callData: delay.iface.encodeFunctionData("queueNonce"),
      },
      {
        target: multicall.address,
        allowFailure: false,
        callData: multicall.iface.encodeFunctionData(
          "getCurrentBlockTimestamp"
        ),
      },
    ],
  ]);

  return {
    to: multicall.address,
    value: 0,
    data,
  };
}

function evaluateResult(
  account: string,
  cooldown: number,
  resultData: string
): AccountQueryResult {
  const result = {
    allowance: {
      balance: BigInt(0),
      refill: BigInt(0),
      maxRefill: BigInt(0),
      period: BigInt(0),
      nextRefill: null,
    },
  };
  try {
    const multicall = deployments.multicall.iface;

    const [aggregate3Result] = multicall.decodeFunctionResult(
      "aggregate3",
      resultData
    );

    const [
      [ownersSuccess, ownersResult],
      [thresholdSuccess, thresholdResult],
      [modulesSuccess, modulesResult],
      [rolesOwnerSuccess, rolesOwnerResult],
      [allowanceSuccess, allowanceResult],
      [delayOwnerSuccess, delayOwnerResult],
      [txCooldownSuccess, txCooldownResult],
      [txNonceSuccess, txNonceResult],
      [queueNonceSuccess, queueNonceResult],
      [, blockTimestampResult],
    ] = aggregate3Result;

    if (
      ownersSuccess !== true ||
      thresholdSuccess !== true ||
      modulesSuccess !== true
    ) {
      return {
        ...result,
        status: AccountIntegrityStatus.SafeNotDeployed,
      };
    }

    if (
      !evaluateOwners(ownersResult, thresholdResult) ||
      !evaluateModules(account, modulesResult)
    ) {
      return {
        ...result,
        status: AccountIntegrityStatus.SafeMisconfigured,
      };
    }

    if (rolesOwnerSuccess !== true || allowanceSuccess != true) {
      return {
        ...result,
        status: AccountIntegrityStatus.RolesNotDeployed,
      };
    }

    if (!evaluateRolesConfig(account, rolesOwnerResult)) {
      return {
        ...result,
        status: AccountIntegrityStatus.RolesMisconfigured,
      };
    }

    if (
      delayOwnerSuccess !== true ||
      txCooldownSuccess !== true ||
      txNonceSuccess !== true ||
      queueNonceSuccess != true
    ) {
      return {
        ...result,
        status: AccountIntegrityStatus.DelayNotDeployed,
      };
    }

    if (
      !evaluateDelayConfig(
        account,
        cooldown,
        delayOwnerResult,
        txCooldownResult
      )
    ) {
      return {
        ...result,
        status: AccountIntegrityStatus.DelayMisconfigured,
      };
    }

    if (!evaluateDelayQueue(txNonceResult, queueNonceResult)) {
      return {
        ...result,
        status: AccountIntegrityStatus.DelayQueueNotEmpty,
      };
    }

    return {
      ...result,
      status: AccountIntegrityStatus.Ok,
      allowance: evaluateAllowance(allowanceResult, blockTimestampResult),
    };
  } catch (e) {
    return {
      ...result,
      status: AccountIntegrityStatus.UnexpectedError,
    };
  }
}

function evaluateOwners(ownersResult: string, thresholdResult: string) {
  if (BigInt(thresholdResult) !== BigInt(1)) {
    return false;
  }

  const { iface } = deployments.safeMastercopy;

  const [owners]: string[][] = iface.decodeFunctionResult(
    "getOwners",
    ownersResult
  );

  return (
    owners.length == 1 &&
    owners[0] === "0x0000000000000000000000000000000000000002"
  );
}

function evaluateModules(safe: string, result: string) {
  const { iface } = deployments.safeMastercopy;

  const [enabledModules]: string[][] = iface.decodeFunctionResult(
    "getModulesPaginated",
    result
  );

  if (enabledModules.length !== 2) {
    return false;
  }

  const delayAddress = predictDelayAddress(safe);
  const rolesAddress = predictRolesAddress(safe);

  return (
    enabledModules.includes(delayAddress) &&
    enabledModules.includes(rolesAddress)
  );
}

function evaluateRolesConfig(safe: string, rolesOwnerResult: string) {
  const abi = AbiCoder.defaultAbiCoder();

  const [rolesOwner] = abi.decode(["address"], rolesOwnerResult);
  const bouncer = predictBouncerAddress(safe);

  return rolesOwner === bouncer;
}

function evaluateDelayConfig(
  safe: string,
  cooldown: number,
  ownerResult: string,
  cooldownResult: string
) {
  const abi = AbiCoder.defaultAbiCoder();
  const [owner] = abi.decode(["address"], ownerResult);

  // check that the safe is the owner of the delay mod
  return (
    owner.toLowerCase() == safe.toLowerCase() &&
    BigInt(cooldownResult) >= BigInt(cooldown)
  );
}

function evaluateDelayQueue(nonceResult: string, queueResult: string) {
  return nonceResult == queueResult;
}

function evaluateAllowance(
  allowanceResult: string,
  blockTimestampResult: string
) {
  const { iface } = deployments.rolesMastercopy;

  const blockTimestamp = BigInt(blockTimestampResult);
  const [refill, maxRefill, period, balance, timestamp]: bigint[] =
    iface.decodeFunctionResult("allowances", allowanceResult);

  assert(typeof refill == "bigint");
  assert(typeof maxRefill == "bigint");
  assert(typeof period == "bigint");
  assert(typeof balance == "bigint");
  assert(typeof timestamp == "bigint");

  const allowance = {
    refill,
    maxRefill,
    period,
    balance,
    timestamp,
    blockTimestamp,
  };

  return {
    balance: accruedBalance(allowance),
    refill,
    maxRefill,
    period,
    nextRefill: nextRefill(allowance),
  };
}

interface AllowanceResult {
  balance: bigint;
  maxRefill: bigint;
  refill: bigint;
  period: bigint;
  timestamp: bigint;
  blockTimestamp: bigint;
}

function accruedBalance({
  refill,
  maxRefill,
  period,
  balance,
  timestamp,
  blockTimestamp,
}: AllowanceResult) {
  if (period == BigInt(0) || blockTimestamp < timestamp + period) {
    return balance;
  }

  if (balance >= maxRefill) {
    return balance;
  }

  const elapsedIntervals = (blockTimestamp - timestamp) / period;
  const balanceUncapped = balance + refill * elapsedIntervals;
  return balanceUncapped < maxRefill ? balanceUncapped : maxRefill;
}

function nextRefill({
  refill,
  period,
  timestamp,
  blockTimestamp,
}: AllowanceResult) {
  if (period == BigInt(0) || refill == BigInt(0)) {
    return null;
  }

  const elapsedIntervals = (blockTimestamp - timestamp) / period;
  return timestamp + (elapsedIntervals + BigInt(1)) * period;
}