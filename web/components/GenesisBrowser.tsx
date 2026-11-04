'use client'

import { useState, type FormEvent } from 'react'
import { CANONICAL_SQUEEK } from '@/lib/deployments'
import { parseIds, shortAddress } from '@/lib/format'
import { useGenesisInfos } from '@/lib/hooks'
import type { NftInfo } from '@/lib/nfts'
import { MAX_ITEMS } from '@/lib/offers'
import { SqueekCard } from './Bits'

const FEATURED_IDS = [9999n, 8938n, 420n, 42n]

export function GenesisBrowser({ chainId, selected, onToggle }: {
  chainId: number
  selected: bigint[]
  onToggle: (id: bigint) => void
}) {
  const [query, setQuery] = useState('')
  const [searchedId, setSearchedId] = useState<bigint | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const featured = useGenesisInfos(chainId, FEATURED_IDS)
  const searched = useGenesisInfos(chainId, searchedId === null ? [] : [searchedId])

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = parseIds(query)[0]
    if (!id || id > 9999n) {
      setSearchedId(null)
      setSearchError('Enter a Genesis token ID from 1 to 9999.')
      return
    }
    setSearchError(null)
    setSearchedId(id)
  }

  const renderCard = (id: bigint, source: NftInfo[] | undefined) => {
    const squeek = source?.find((item) => item.tokenId === id)
    const unavailable = !!squeek && (!squeek.owner || squeek.custody === 'staking')
    const atLimit = selected.length >= MAX_ITEMS && !selected.includes(id)
    const caption = !squeek
      ? 'Reading artwork and owner…'
      : !squeek.owner
        ? 'Burned or not issued'
        : squeek.custody === 'staking'
          ? 'Staked · owner must withdraw first'
          : `Held by ${shortAddress(squeek.owner)}`
    return (
      <SqueekCard
        key={id.toString()}
        chainId={chainId}
        id={id}
        level={squeek?.level ?? undefined}
        custody={squeek?.custody}
        caption={caption}
        selected={selected.includes(id)}
        disabled={unavailable || atLimit}
        onToggle={() => onToggle(id)}
      />
    )
  }

  return (
    <div className="catalog">
      <div className="catalog-top">
        <div>
          <span className="official-badge">OFFICIAL SQUEEK GENESIS</span>
          <h3>Browse Genesis</h3>
          <p className="note">Verified collection {shortAddress(CANONICAL_SQUEEK)}. Search by token ID or select one below.</p>
        </div>
        <form className="catalog-search" onSubmit={search}>
          <label className="lab" htmlFor="squeek-search">Find a Squeek</label>
          <div className="row-actions">
            <input id="squeek-search" inputMode="numeric" placeholder="Token ID, e.g. 8938" value={query} onChange={(event) => setQuery(event.target.value)} />
            <button type="submit" className="btn">Search</button>
          </div>
          {searchError ? <p className="error">{searchError}</p> : null}
        </form>
      </div>

      {searchedId !== null ? (
        <div className="catalog-result">
          <div className="catalog-result-head"><span className="lab">SEARCH RESULT</span><button type="button" className="text-button" onClick={() => { setSearchedId(null); setQuery('') }}>Clear</button></div>
          {searched.isLoading ? <p className="note">Finding Squeek #{searchedId.toString()}…</p> : null}
          {searched.error ? <p className="error">{(searched.error as Error).message}</p> : null}
          <div className="grid compact-grid">{renderCard(searchedId, searched.data)}</div>
        </div>
      ) : null}

      <div className="catalog-featured">
          <div className="catalog-result-head"><span className="lab">FEATURED GENESIS NFTS</span><span className="note">Select up to {MAX_ITEMS}</span></div>
        {featured.isLoading ? <p className="note">Loading official Genesis NFTs...</p> : null}
        {featured.error ? <p className="error">{(featured.error as Error).message}</p> : null}
        <div className="grid">{FEATURED_IDS.map((id) => renderCard(id, featured.data))}</div>
      </div>
    </div>
  )
}
