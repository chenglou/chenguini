import {contract, contractValue, type StaticContractSpec} from '../contracts'

export const staticLayoutContracts = {
  measurePromptLayout: contract.returnValue(contractValue.object({
    width: contractValue.arg(1),
    visibleHeight: contractValue.mul(contractValue.arg(3), contractValue.number(2)),
    lines: contractValue.array([]),
  })),
} satisfies Record<string, StaticContractSpec>
