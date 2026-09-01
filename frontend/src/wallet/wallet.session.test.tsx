/* PROMPT-V4 M2 session laws: the session persists under vilmei.wallet-session
   and is restored on load; a legacy (kind-less) session reads back as 'mock';
   a live connect stores kind:'live' with the extension's real address. */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WalletProvider } from './WalletContext'
import { WalletButton } from './WalletButton'

function picker() {
  const view = render(
    <WalletProvider>
      <WalletButton />
    </WalletProvider>,
  )
  fireEvent.click(view.getByTestId('wallet-connect'))
  return view
}

beforeEach(() => { localStorage.clear() })
afterEach(() => cleanup())

describe('M2 — wallet session persistence + live connect', () => {
  it('restores a persisted LIVE session without re-connecting', () => {
    localStorage.setItem('vilmei.wallet-session', JSON.stringify({
      providerId: 'uuid:io.metamask', label: 'MetaMask', chainFam: 'evm',
      address: '0xAbCd00000000000000000000000000000000dEaD', balances: {}, kind: 'live',
    }))
    const { getByText, queryByTestId } = render(
      <WalletProvider><WalletButton /></WalletProvider>,
    )
    expect(getByText('METAMASK')).toBeTruthy()               // label = the real wallet
    expect(queryByTestId('wallet-connect')).toBeNull()        // already connected
  })

  it('a legacy session without kind reads back as the labelled DEMO identity', () => {
    localStorage.setItem('vilmei.wallet-session', JSON.stringify({
      providerId: 'phantom', label: 'Phantom', chainFam: 'solana',
      address: 'MockAddr111111111111111111111111111111111111', balances: {},
    }))
    const { getByText } = render(
      <WalletProvider><WalletButton /></WalletProvider>,
    )
    expect(getByText('DEMO WALLET')).toBeTruthy()
  })

  it('a live connect: EIP-6963 wallet → picker row → address-only session persisted', async () => {
    const view = picker()
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: { uuid: 'uuid:io.metamask', name: 'MetaMask', icon: 'i', rdns: 'io.metamask' },
        provider: { request: async () => ['0xAbCd00000000000000000000000000000000dEaD'] },
      },
    }))
    fireEvent.click(await view.findByTestId('wallet-live-uuid:io.metamask'))
    await waitFor(() => expect(view.getByText('METAMASK')).toBeTruthy())
    const stored = JSON.parse(localStorage.getItem('vilmei.wallet-session') ?? 'null')
    expect(stored).toMatchObject({
      kind: 'live', chainFam: 'evm', rdns: 'io.metamask',
      address: '0xAbCd00000000000000000000000000000000dEaD',
    })
    expect(stored.balances).toEqual({})    // holdings arrive in M5 — never demo numbers on a live address
  })

  it('the DEMO path persists kind:mock and disconnect clears the key', async () => {
    const view = picker()
    fireEvent.click(view.getByTestId('wallet-demo'))
    await waitFor(() => expect(view.getByText('DEMO WALLET')).toBeTruthy())
    expect(JSON.parse(localStorage.getItem('vilmei.wallet-session') ?? 'null')).toMatchObject({ kind: 'mock' })
    fireEvent.click(view.getByText('DEMO WALLET'))            // open the menu
    fireEvent.click(view.getByTestId('wallet-disconnect'))
    expect(localStorage.getItem('vilmei.wallet-session')).toBe('null')
  })
})
