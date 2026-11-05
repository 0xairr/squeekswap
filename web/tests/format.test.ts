import { describe, expect, it } from 'vitest'
import { addressUrl, chainMismatch, isTestNetwork, networkName, parseIds, parseOfferParams, same, shortAddress, sideLabels, timeAgo, timeLeft, tradeTitle, txUrl, who } from '@/lib/format'

describe('format', () => {
  it('shortens addresses', () => {
    expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678')
  })
  it('compares addresses case-insensitively and treats missing as different', () => {
    expect(same('0xAbC0000000000000000000000000000000000001', '0xabc0000000000000000000000000000000000001')).toBe(true)
    expect(same(undefined, '0xabc0000000000000000000000000000000000001')).toBe(false)
    expect(same(null, null)).toBe(false)
  })
  it('parses token numbers from free text, unique, in order', () => {
    expect(parseIds('#56473, 35907 #56473\n11177')).toEqual([56473n, 35907n, 11177n])
    expect(parseIds('abc 0 -5')).toEqual([])
  })
  it('names networks', () => {
    expect(networkName(1)).toBe('Ethereum')
    expect(networkName(11155111)).toBe('Sepolia')
    expect(networkName(31337)).toBe('Local')
  })
  it('flags a wallet on another network', () => {
    expect(chainMismatch(11155111, 1)).toBe(true)
    expect(chainMismatch(1, 1)).toBe(false)
    expect(chainMismatch(undefined, 1)).toBe(false)
  })
  it('links transactions to the right explorer', () => {
    const h = '0xabc'
    expect(txUrl(1, h)).toBe('https://etherscan.io/tx/0xabc')
    expect(txUrl(11155111, h)).toBe('https://sepolia.etherscan.io/tx/0xabc')
    expect(txUrl(31337, h)).toBeNull()
  })
  it('links addresses to the right explorer', () => {
    expect(addressUrl(1, '0xabc')).toBe('https://etherscan.io/address/0xabc')
    expect(addressUrl(31337, '0xabc')).toBeNull()
  })
  it('marks every network except Ethereum mainnet as a test network', () => {
    expect(isTestNetwork(1)).toBe(false)
    expect(isTestNetwork(11155111)).toBe(true)
    expect(isTestNetwork(31337)).toBe(true)
  })
  it('labels offer sides from the point of view of the viewer', () => {
    const maker = '0xAAAA000000000000000000000000000000000001'
    const anyone = '0x0000000000000000000000000000000000000000'
    const taker = '0xbbbb000000000000000000000000000000000002'
    const stranger = '0xcccc000000000000000000000000000000000003'
    expect(sideLabels(maker.toLowerCase(), maker, taker)).toEqual({ give: 'You give', want: 'You get' })
    expect(sideLabels(taker, maker, taker)).toEqual({ give: 'You get', want: 'You give' })
    expect(sideLabels(stranger, maker, anyone)).toEqual({ give: 'You get', want: 'You give' })
    expect(sideLabels(stranger, maker, taker)).toEqual({ give: 'Maker gives', want: 'Maker wants' })
    expect(sideLabels(undefined, maker, anyone)).toEqual({ give: 'Maker gives', want: 'Maker wants' })
  })
  it('parses offer URL params and rejects junk', () => {
    expect(parseOfferParams('1', '42')).toEqual({ chainId: 1, id: 42n })
    expect(parseOfferParams('1', 'abc')).toBeNull()
    expect(parseOfferParams('x', '1')).toBeNull()
    expect(parseOfferParams('1', '0')).toBeNull()
  })

  it('titles a trade by its Squeeks', () => {
    expect(tradeTitle([{ tokenId: 19n }], [{ tokenId: 20n }])).toBe('#19 for #20')
    expect(tradeTitle([{ tokenId: 1n }, { tokenId: 2n }, { tokenId: 3n }], [{ tokenId: 4n }, { tokenId: 5n }])).toBe('3 Squeeks for 2')
    expect(tradeTitle([{ tokenId: 1n }], [{ tokenId: 4n }, { tokenId: 5n }])).toBe('1 Squeek for 2')
  })
  it('names the viewer as You', () => {
    expect(who('0xAbC0000000000000000000000000000000000001', '0xabc0000000000000000000000000000000000001')).toBe('You')
    expect(who('0xabc0000000000000000000000000000000000001', undefined)).toBe('0xabc0…0001')
  })
  it('says how long ago and how long is left', () => {
    expect(timeAgo(1000, 1030)).toBe('just now')
    expect(timeAgo(1000, 1000 + 3 * 3600 + 5)).toBe('3 hours ago')
    expect(timeAgo(1000, 1000 + 86400)).toBe('1 day ago')
    expect(timeLeft(1000 + 6 * 86400 + 100, 1000)).toBe('6 days left')
    expect(timeLeft(1000 + 59, 1000)).toBe('less than a minute left')
    expect(timeLeft(1000, 1000)).toBe('Expired')
  })
})
