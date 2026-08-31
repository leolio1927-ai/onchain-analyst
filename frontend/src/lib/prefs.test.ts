/* P7 gate (PROMPT-V2B): alpha.* → vilmei.* migration-once.
   A legacy preference is PRESERVED under the vilmei.* key and the legacy
   key is removed — exactly once; later reads never resurrect anything. */
import { beforeEach, describe, expect, it } from 'vitest'
import { getRiskMode, getWalletSession } from './prefs'

beforeEach(() => { localStorage.clear() })

describe('P7 migration-once — alpha.* → vilmei.*', () => {
  it('preserves the legacy risk-mode under vilmei.* and removes the legacy key', () => {
    localStorage.setItem('alpha.risk-mode', JSON.stringify('log'))
    expect(getRiskMode()).toBe('log')                       // preserved
    expect(localStorage.getItem('vilmei.risk-mode')).toBe(JSON.stringify('log'))
    expect(localStorage.getItem('alpha.risk-mode')).toBeNull()  // legacy removed
  })

  it('never overwrites a vilmei.* value the user already owns', () => {
    localStorage.setItem('vilmei.risk-mode', JSON.stringify('tape'))
    localStorage.setItem('alpha.risk-mode', JSON.stringify('log'))
    expect(getRiskMode()).toBe('tape')                      // current wins
    expect(localStorage.getItem('alpha.risk-mode')).toBeNull()
  })

  it('preserves the legacy wallet mock session', () => {
    const session = { providerId: 'mock-evm', label: 'Mock', address: '0xabc' }
    localStorage.setItem('alpha.wallet-session', JSON.stringify(session))
    expect(getWalletSession()).toMatchObject({ address: '0xabc' })
    expect(localStorage.getItem('vilmei.wallet-session')).toBe(JSON.stringify(session))
    expect(localStorage.getItem('alpha.wallet-session')).toBeNull()
  })

  it('recents migrate once into vilmei.recents (module init)', async () => {
    const pair = [{ chain: 'sol', tokenAddress: 'BONK', symbol: 'BONK', source: 'detect' }]
    localStorage.setItem('alpha.recents', JSON.stringify(pair))
    await import('./tokenStore')   // loadRecents runs the migration at init
    expect(localStorage.getItem('vilmei.recents')).toBe(JSON.stringify(pair))
    expect(localStorage.getItem('alpha.recents')).toBeNull()
  })
})
