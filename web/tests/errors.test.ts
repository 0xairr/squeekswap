import { describe, expect, it } from 'vitest'
import { ContractFunctionRevertedError, encodeErrorResult, UserRejectedRequestError } from 'viem'
import { swapAbi } from '@/lib/abis'
import { CONTRACT_ERRORS, friendlyError } from '@/lib/errors'

const revert = (errorName: string, args: readonly unknown[] = []) =>
  new ContractFunctionRevertedError({ abi: swapAbi, functionName: 'fill', data: encodeErrorResult({ abi: swapAbi, errorName, args } as never) })

describe('friendlyError', () => {
  it('has a plain-words message for every error the contract ABI declares', () => {
    const declared = swapAbi.filter((item) => item.type === 'error').map((item) => item.name).filter((name) => name !== 'CannotFill')
    expect(declared.length).toBeGreaterThan(15)
    for (const name of declared) expect(CONTRACT_ERRORS[name], name).toBeTruthy()
  })
  it('decodes custom contract errors instead of showing an unknown signature', () => {
    expect(friendlyError(revert('NotOwner', ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 5n]))).toBe(CONTRACT_ERRORS.NotOwner)
    expect(friendlyError(revert('BadWantedOwner', ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 5n]))).toBe(CONTRACT_ERRORS.BadWantedOwner)
    expect(friendlyError(revert('ERC721InsufficientApproval', ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 5n]))).toBe(CONTRACT_ERRORS.ERC721InsufficientApproval)
  })
  it('explains a CannotFill reason', () => {
    expect(friendlyError(revert('CannotFill', [8]))).toBe('Approve each requested NFT first.')
  })
  it('recognises a wallet rejection', () => {
    expect(friendlyError(new UserRejectedRequestError(new Error('no')))).toMatch(/rejected/)
  })
})
