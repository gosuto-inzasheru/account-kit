import {
  SingletonDeployment,
  getFallbackHandlerDeployment,
  getMultiSendDeployment,
  getProxyFactoryDeployment,
  getSafeSingletonDeployment,
} from "@safe-global/safe-deployments/";

const VERSION = "v1.3.0";

const deployments = {
  proxyFactory: getProxyFactoryDeployment({
    version: VERSION,
  }) as SingletonDeployment,
  safe: getSafeSingletonDeployment({
    version: VERSION,
  }) as SingletonDeployment,
  fallbackHandler: getFallbackHandlerDeployment({
    version: VERSION,
  }) as SingletonDeployment,
  multiSend: getMultiSendDeployment({
    version: VERSION,
  }) as SingletonDeployment,
};

export default deployments;

// this is the creation bytecode for v1.3.0
export const proxyCreationBytecode =
  "0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea2646970667358221220d1429297349653a4918076d650332de1a1068c5f3e07c5c82360c277770b955264736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564";
