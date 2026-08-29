/* SWAP MOCKUP (PROMPT-S) — premium FE-only mock, zero backend, zero deps.
   Every number on this panel is STATIC mock data and carries a MOCK chip:
   nothing may read as live (honesty law). Final contract = terminal sidebar
   (internal beta); /swap-preview exists only for founder screenshots.
   DNA: bordir 2px, accent 60%/hover 90% + rest glow, dashed rails, mono. */
import { useMemo, useState } from 'react'
import { LIVE_CHAINS, LIVE_CHAIN_LABEL } from '../lib/liveApi'
import type { LiveChain } from '../lib/liveApi'
import { truncAddr } from '../lib/liveFormat'
import { accentStyle } from './liveParts'
import { ChainLogo } from './chainLogos'
import './styles/live.css'

interface MockToken {
  symbol: string
  name: string
  price: number // static mock USD price — the whole quote math hangs off this
  balance: number
  ca: string
}

const NATIVE: Record<LiveChain, string> = {
  sol: 'SOL', bnb: 'BNB', base: 'ETH', hype: 'HYPE', hood: 'ETH', avax: 'AVAX',
}

const QUICK: Record<LiveChain, number[]> = {
  sol: [0.1, 0.5, 1, 5],
  bnb: [0.01, 0.05, 0.1, 1], base: [0.01, 0.05, 0.1, 1], hype: [0.01, 0.05, 0.1, 1],
  hood: [0.01, 0.05, 0.1, 1], avax: [0.01, 0.05, 0.1, 1],
}

function mockTokens(chain: LiveChain): MockToken[] {
  const sym = NATIVE[chain]
  const nativePrice = chain === 'sol' ? 143.52 : chain === 'bnb' ? 912.4 : chain === 'hype' ? 38.11 : 1
  return [
    { symbol: sym, name: `${LIVE_CHAIN_LABEL[chain]} native`, price: nativePrice,
      balance: chain === 'sol' ? 3.421 : 0.85,
      ca: chain === 'sol' ? 'So11111111111111111111111111111111111111112' : `0x${chain}native0000000000000000000000` },
    { symbol: 'USDC', name: 'USD Coin (mock)', price: 1, balance: 812.3,
      ca: `0x${chain}usdc0000000000000000000000000000` },
    { symbol: 'FOMO', name: 'Mock Meme Token', price: 0.0031, balance: 0,
      ca: `0x${chain}fomo000000000000000000000000000` },
  ]
}

const Mock = () => <span className="lx-mock">MOCK</span>

function Menu({ open, children, right }: { open: boolean; children: React.ReactNode; right?: boolean }) {
  if (!open) return null
  return <div className={`sw-menu${right ? ' right' : ''}`} role="menu">{children}</div>
}

export function SwapPanel() {
  const [chain, setChain] = useState<LiveChain>('sol')
  const [dir, setDir] = useState<'buy' | 'sell'>('buy')
  const [payIdx, setPayIdx] = useState(0)
  const [amount, setAmount] = useState('')
  const [pct, setPct] = useState(0)
  const [menu, setMenu] = useState<'none' | 'chain' | 'pay' | 'get'>('none')
  const [adv, setAdv] = useState(false)
  const [note, setNote] = useState('')

  const tokens = useMemo(() => mockTokens(chain), [chain])
  const native = tokens[0]
  const meme = tokens[2]
  const pay = dir === 'buy' ? tokens[payIdx] : meme
  const get = pay === meme ? native : meme

  const n = Number.parseFloat(amount)
  const payAmt = Number.isFinite(n) && n > 0 ? n : 0
  const getAmt = payAmt * pay.price / get.price
  const getStr = getAmt === 0 ? '0.00' : getAmt >= 1000
    ? getAmt.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : getAmt.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')

  const setPctTo = (p: number) => {
    setPct(p)
    const v = pay.balance * p / 100
    setAmount(p === 0 ? '' : String(Number(v.toFixed(6))))
  }
  const setAmt = (v: string) => {
    setAmount(v)
    const x = Number.parseFloat(v)
    const nxt = Number.isFinite(x) && pay.balance > 0 ? Math.min(100, x / pay.balance * 100) : 0
    setPct(Math.round(nxt))
  }
  const flip = () => { setDir((d) => (d === 'buy' ? 'sell' : 'buy')); setAmount(''); setPct(0) }

  return (
    <div className="sw-root" onClick={() => menu !== 'none' && setMenu('none')}>
      <div className="sw-grid">
        <section className="lx-card sw-panel" data-chain={chain} style={accentStyle(chain)}
          onClick={(e) => e.stopPropagation()}>
          <div className="sw-head">
            <span className="sw-kicker">SWAP</span>
            <Mock />
            <span className="sw-chain-name">{LIVE_CHAIN_LABEL[chain]} · MOCK PAIR</span>
          </div>

          <div className="sw-tabs" role="tablist" aria-label="direction">
            <button type="button" role="tab" aria-selected={dir === 'buy'}
              className={`sw-tab buy${dir === 'buy' ? ' on' : ''}`} onClick={() => setDir('buy')}>BUY</button>
            <button type="button" role="tab" aria-selected={dir === 'sell'}
              className={`sw-tab sell${dir === 'sell' ? ' on' : ''}`} onClick={() => setDir('sell')}>SELL</button>
          </div>

          <div className="sw-field">
            <div className="sw-field-hd">
              <span className="sw-lbl">YOU PAY</span>
              <span className="sw-bal">BAL {pay.balance} <Mock /></span>
            </div>
            <div className="sw-inrow">
              <input className="sw-input" inputMode="decimal" placeholder="0.00"
                value={amount} onChange={(e) => setAmt(e.target.value)} aria-label="amount to pay" />
              <div className="sw-pickers">
                <div className="sw-chain" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="sw-chain-btn" aria-expanded={menu === 'chain'}
                    onClick={() => setMenu(menu === 'chain' ? 'none' : 'chain')}>
                    <ChainLogo chain={chain} size={26} />
                    <span className="sw-chip-sym">{NATIVE[chain]}</span>
                    <span className="sw-caret">▾</span>
                  </button>
                  <Menu open={menu === 'chain'}>
                    {LIVE_CHAINS.map((c) => (
                      <button type="button" key={c} role="menuitem" className="sw-menu-item"
                        onClick={() => { setChain(c); setPayIdx(0); setAmount(''); setPct(0); setMenu('none') }}>
                        <ChainLogo chain={c} size={22} />
                        <span>{LIVE_CHAIN_LABEL[c]}</span>
                        <span className="sw-menu-sym">{NATIVE[c]}</span>
                      </button>
                    ))}
                  </Menu>
                </div>
                <div className="sw-chain" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="sw-chain-btn" aria-expanded={menu === 'pay'}
                    onClick={() => setMenu(menu === 'pay' ? 'none' : 'pay')}>
                    <span className="sw-tok-ico">{pay.symbol.slice(0, 1)}</span>
                    <span className="sw-chip-sym">{pay.symbol}</span>
                    <span className="sw-caret">▾</span>
                  </button>
                  <Menu open={menu === 'pay'} right>
                    {tokens.map((t) => (
                      <button type="button" key={t.symbol} role="menuitem" className="sw-menu-item"
                        onClick={() => { setPayIdx(tokens.indexOf(t)); setAmount(''); setPct(0); setMenu('none') }}>
                        <span className="sw-tok-ico">{t.symbol.slice(0, 1)}</span>
                        <span>{t.name}</span>
                        <span className="sw-menu-sym">{t.symbol}</span>
                      </button>
                    ))}
                  </Menu>
                </div>
              </div>
            </div>
            <div className="sw-quick">
              {QUICK[chain].map((q) => (
                <button type="button" key={q} onClick={() => setAmt(String(q))}>{q}</button>
              ))}
              <button type="button" onClick={() => setPctTo(100)}>MAX</button>
            </div>
            <div className="sw-rail" role="slider" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={pct} aria-label="percent of balance">
              <div className="sw-rail-track"><i style={{ width: `${pct}%` }} /></div>
              <div className="sw-stops">
                {[0, 25, 50, 75, 100].map((p) => (
                  <button type="button" key={p} className={pct === p ? 'on' : ''}
                    onClick={() => setPctTo(p)}>{p === 100 ? 'MAX' : `${p}`}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="sw-flip">
            <button type="button" onClick={flip} aria-label="flip pay and get">⇅</button>
          </div>

          <div className="sw-field">
            <div className="sw-field-hd"><span className="sw-lbl">YOU GET</span><Mock /></div>
            <div className="sw-inrow">
              <span className="sw-input ro">{getStr}</span>
              <div className="sw-pickers">
                <div className="sw-chain" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="sw-chain-btn" aria-expanded={menu === 'get'}
                    onClick={() => setMenu(menu === 'get' ? 'none' : 'get')}>
                    <span className="sw-tok-ico">{get.symbol.slice(0, 1)}</span>
                    <span className="sw-chip-sym">{get.symbol}</span>
                    <span className="sw-caret">▾</span>
                  </button>
                  <Menu open={menu === 'get'} right>
                    {(pay === meme ? [native] : [meme, native]).map((t) => (
                      <button type="button" key={t.symbol} role="menuitem" className="sw-menu-item"
                        onClick={() => { flip(); setMenu('none') }}>
                        <span className="sw-tok-ico">{t.symbol.slice(0, 1)}</span>
                        <span>{t.name}</span>
                        <span className="sw-menu-sym">{t.symbol}</span>
                      </button>
                    ))}
                  </Menu>
                </div>
              </div>
            </div>
            <p className="sw-quote-note">quote = input × static mock price ({fmtMockPrice(pay.price)} → {fmtMockPrice(get.price)})</p>
          </div>

          <button type="button" className="sw-adv-hd" aria-expanded={adv} onClick={() => setAdv((a) => !a)}>
            ADVANCED <span className="sw-caret">{adv ? '▴' : '▾'}</span>
          </button>
          {adv && (
            <div className="sw-adv">
              <label>SLIPPAGE TOLERANCE <Mock /><input placeholder="1.0 %" readOnly tabIndex={-1} /></label>
              <label>DEADLINE <Mock /><input placeholder="30 min" readOnly tabIndex={-1} /></label>
              <p>placeholders only — wiring lands with the real quote engine</p>
            </div>
          )}

          <button type="button" className="sw-cta" onClick={() => setNote('Mockup only — no wallet, no chain call. Implementation lands later.')}>
            {payAmt > 0 ? 'SWAP' : 'CONNECT WALLET'}
          </button>
          {note && <p className="sw-note">{note}</p>}
        </section>

        <aside className="sw-side">
          <section className="lx-card sw-side-block" data-chain={chain} style={accentStyle(chain)}>
            <div className="sw-side-hd">BUY / SELL PRESSURE <Mock /></div>
            <div className="sw-pulse">
              <div className="sw-pulse-row">
                <span className="k">BUY</span>
                <div className="bar"><i className="up" style={{ width: '62%' }} /></div>
                <span className="v up">+62%</span>
              </div>
              <div className="sw-pulse-row">
                <span className="k">SELL</span>
                <div className="bar"><i className="dn" style={{ width: '38%' }} /></div>
                <span className="v dn">−38%</span>
              </div>
            </div>
          </section>

          <section className="lx-card sw-side-block" data-chain={chain} style={accentStyle(chain)}>
            <div className="sw-side-hd">MOVEMENT <Mock /></div>
            <div className="sw-stats">
              {[['5M', '+0.4%', true], ['1H', '+1.2%', true], ['4H', '−2.1%', false], ['24H', '+5.6%', true]].map(
                ([t, v, up]) => (
                  <div className="sw-stat" key={t as string}>
                    <span className="t">{t as string}</span>
                    <span className={`v ${up ? 'up' : 'dn'}`}>{v as string}</span>
                  </div>
                ),
              )}
            </div>
            <div className="sw-split">
              <div className="sw-split-row">
                <span className="t">TXNS</span>
                <span className="b up">BUY 1,204</span>
                <span className="b dn">SELL 986</span>
              </div>
              <div className="sw-split-bar"><i className="up" style={{ width: '55%' }} /><i className="dn" style={{ width: '45%' }} /></div>
              <div className="sw-split-row">
                <span className="t">VOL</span>
                <span className="b up">$482K</span>
                <span className="b dn">$301K</span>
              </div>
              <div className="sw-split-bar"><i className="up" style={{ width: '62%' }} /><i className="dn" style={{ width: '38%' }} /></div>
            </div>
          </section>

          <section className="lx-card sw-side-block" data-chain={chain} style={accentStyle(chain)}>
            <div className="sw-side-hd">INFORMATION <Mock /></div>
            <div className="sw-info">
              <span className="sw-info-logo">{meme.symbol.slice(0, 1)}</span>
              <div className="sw-info-id">
                <b>{meme.symbol}</b>
                <span>{meme.name}</span>
                <span className="sw-ca">{truncAddr(meme.ca)} ⧉</span>
              </div>
              <span className="sw-info-badge">MECOIN</span>
            </div>
            <p className="sw-info-note">Mock pair — the quote is input × static price. No wallet, no chain call, nothing live.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}

function fmtMockPrice(p: number): string {
  return p >= 1 ? `$${p.toFixed(2)}` : `$${p.toPrecision(3)}`
}
