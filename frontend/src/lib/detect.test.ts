/* FE twin of providers/market.py classify — parity with the probed BE law */
import { describe, expect, it } from 'vitest'
import { classifyQuery } from './detect'

describe('classifyQuery — auto-detect local classify (Fase 3.1)', () => {
  it('base58 32-44 → solana-shaped', () => {
    expect(classifyQuery('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263')).toBe('base58')
    /* 0/O/I/l are NOT base58 — a demo CA with a zero must stay invalid */
    expect(classifyQuery('FzMax4vEr111111111111111111111111111111')).toBe('base58')
    expect(classifyQuery('F0Mo4vEr1111111111111111111111111111111')).toBe('invalid')
  })

  it('0x + 40 hex → EVM-ambiguous (bnb/base/hype/hood — never one chain)', () => {
    expect(classifyQuery('0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82')).toBe('evm-ambiguous')
  })

  it('ticker with or without $ → ticker', () => {
    expect(classifyQuery('BONK')).toBe('ticker')
    expect(classifyQuery('$bonk')).toBe('ticker')
  })

  it('junk → invalid', () => {
    expect(classifyQuery('x!!')).toBe('invalid')
    expect(classifyQuery('')).toBe('invalid')
  })
})
