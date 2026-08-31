/* PROMPT-V4 M2 laws under test: wallet discovery is the two 2026 standards
   hand-rolled (EIP-6963 + Solana Wallet Standard), zero dependencies, and
   the ONLY thing ever requested is account visibility — a public address.
   No sign*, no send*: the call log of a fake provider proves it. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { b58encode, discoverWallets } from './live'
import type { LiveWallet } from './live'

function announceEvm(name: string, rdns: string, accounts: string[]) {
  const request = vi.fn(async (args: { method: string }) => {
    if (args.method === 'eth_requestAccounts') return accounts
    throw new Error(`forbidden method ${args.method}`)
  })
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: {
      info: { uuid: `uuid:${rdns}`, name, icon: `data:${name}.svg`, rdns },
      provider: { request },
    },
  }))
  return request
}

function registerSol(name: string, address: Uint8Array | string, chains = ['solana:mainnet']) {
  const connect = vi.fn(async () => ({ accounts: [{ address }] }))
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', {
    detail: [{
      name, icon: `data:${name}.svg`, chains,
      features: { 'standard:connect': { version: '1.0.0', connect } },
    }],
  }))
  return connect
}

let stop: (() => void) | null = null
function collect(): LiveWallet[] {
  const wallets: LiveWallet[] = []
  stop = discoverWallets((w) => { wallets.length = 0; wallets.push(...w) })
  return wallets
}

afterEach(() => { stop?.(); stop = null })

describe('M2 — zero-dep live discovery, address-only', () => {
  it('base58: leading zero bytes are literal 1s, value bytes encode big-endian', () => {
    expect(b58encode(new Uint8Array([0, 0, 3]))).toBe('114')
    expect(b58encode(new Uint8Array([0, 1]))).toBe('12')
    expect(b58encode(new Uint8Array([]))).toBe('')
  })

  it('EIP-6963: an announced provider is detected and connects to a public address', async () => {
    const wallets = collect()
    const request = announceEvm('MetaMask', 'io.metamask', ['0xAbCd00000000000000000000000000000000dEaD'])
    expect(wallets).toHaveLength(1)
    expect(wallets[0]).toMatchObject({ fam: 'evm', name: 'MetaMask', rdns: 'io.metamask' })
    const address = await wallets[0].connect()
    expect(address).toBe('0xAbCd00000000000000000000000000000000dEaD')
    // the ADDRESS-ONLY law: exactly one call, and it is eth_requestAccounts
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0].method).toBe('eth_requestAccounts')
  })

  it('Wallet Standard: a registered solana wallet connects to base58 account bytes', async () => {
    const wallets = collect()
    const connect = registerSol('Phantom', new Uint8Array([0, 0, 3]))
    expect(wallets).toHaveLength(1)
    expect(wallets[0]).toMatchObject({ fam: 'solana', name: 'Phantom' })
    expect(await wallets[0].connect()).toBe('114')
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('Wallet Standard: string addresses pass through verbatim; non-solana chains are filtered', async () => {
    const wallets = collect()
    registerSol('Solflare', 'So1flareAddr111111111111111111111111111111111')
    registerSol('BitcoinWallet', 'bc1qxyz', ['bitcoin:mainnet'])
    expect(wallets).toHaveLength(1)
    expect(wallets[0].name).toBe('Solflare')
    expect(await wallets[0].connect()).toBe('So1flareAddr111111111111111111111111111111111')
  })

  it('a silent extension is an honest error, never a crash', async () => {
    const wallets = collect()
    announceEvm('EmptyWallet', 'com.empty', [])
    await expect(wallets[0].connect()).rejects.toThrow('no public address returned')
  })
})
