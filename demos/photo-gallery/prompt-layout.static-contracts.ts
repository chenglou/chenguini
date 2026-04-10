import {contract, contractValue, type ConcreteContractSpec} from '../layout-static-contracts'

export const staticLayoutContracts = {
  measurePromptLayout: contract.returnValue(contractValue.object({
    width: contractValue.arg(1),
    visibleHeight: contractValue.mul(contractValue.arg(3), contractValue.number(2)),
    lines: contractValue.array([]),
  })),
} satisfies Record<string, ConcreteContractSpec>
