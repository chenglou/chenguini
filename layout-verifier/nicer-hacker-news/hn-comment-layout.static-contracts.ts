import {contract, type StaticContractSpec} from '../contracts'

export const staticLayoutContracts = {
  walkRichInlineLineRanges: contract.forEachArrayItem(0, ['lineRanges'], 2),
  materializeRichInlineLineRange: contract.returnArg(1),
  layoutNextLine: contract.lookupArrayItem(0, ['lines'], 1, ['segmentIndex'], {defaultNull: true}),
  measureFragmentTextWidth: contract.stringUnitWidth(1, 10),
  pushMergedRect: contract.pushOrMergeRect(0, 1),
} satisfies Record<string, StaticContractSpec>
