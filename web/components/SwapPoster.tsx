'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { SQUEEK_CHAIN_ID } from '@/lib/deployments'
import { useGenesisInfos } from '@/lib/hooks'
import { genesisImagePath } from '@/lib/reads'

// Two real Genesis Squeeks with their live onchain levels, swapping places. Drag to tilt.
const PAIR = [420n, 9999n] as const

export function SwapPoster() {
  const posterRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const frame = useRef<number | null>(null)
  const [flipped, setFlipped] = useState(false)
  const infos = useGenesisInfos(SQUEEK_CHAIN_ID, [...PAIR])
  const level = (id: bigint) => infos.data.find((row) => row.tokenId === id)?.level ?? null

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
  }, [])

  function position(event: PointerEvent<HTMLDivElement>) {
    const poster = posterRef.current
    if (!poster || !dragging.current) return
    const rect = poster.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      poster.style.setProperty('--poster-rx', `${(0.5 - y) * 8}deg`)
      poster.style.setProperty('--poster-ry', `${(x - 0.5) * 10}deg`)
      poster.style.setProperty('--poster-x', `${x * 100}%`)
      poster.style.setProperty('--poster-y', `${y * 100}%`)
    })
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest('button')) return
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.classList.add('is-dragging')
    position(event)
  }

  function stop(event: PointerEvent<HTMLDivElement>) {
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    event.currentTarget.classList.remove('is-dragging')
    event.currentTarget.style.setProperty('--poster-rx', '0deg')
    event.currentTarget.style.setProperty('--poster-ry', '0deg')
  }

  const ticket = (id: bigint, side: 'a' | 'b') => {
    const lvl = level(id)
    return (
      <div className={`poster-ticket poster-ticket-${side}`}>
        <img src={genesisImagePath(id, lvl)} alt={`Squeek Genesis #${id}`} width={88} height={88} decoding="async" draggable={false} />
        <span>#{id.toString()}</span>
        <b>{lvl ? `LVL ${lvl}` : ''}</b>
      </div>
    )
  }

  return (
    <div
      ref={posterRef}
      className={`swap-poster${flipped ? ' is-flipped' : ''}`}
      onPointerDown={start}
      onPointerMove={position}
      onPointerUp={stop}
      onPointerCancel={stop}
      aria-label="Two Squeek Genesis NFTs trading places. Drag to tilt."
    >
      <div className="poster-glow" aria-hidden="true" />
      {ticket(flipped ? PAIR[1] : PAIR[0], 'a')}
      <div className="poster-middle"><span>ONE TRANSACTION</span><button type="button" onClick={() => setFlipped((value) => !value)} aria-label="Swap the two Squeeks"><span aria-hidden="true">⇄</span></button></div>
      {ticket(flipped ? PAIR[0] : PAIR[1], 'b')}
      <span className="poster-hint">DRAG TO TILT</span>
    </div>
  )
}
