'use client'

import { useEffect, useState } from 'react'

export function TiffViewer({ pages }: { pages: string[] }) {
  const [currentPage, setCurrentPage] = useState(0)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (zoomed && event.key === 'Escape') {
        setZoomed(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [zoomed])

  if (pages.length === 0) {
    return (
      <div className="text-xs text-[var(--hg-text-tertiary)] py-2">
        No pages available
      </div>
    )
  }

  const current = pages[currentPage]!

  return (
    <div className="mt-3 border border-[var(--hg-border)] bg-[var(--hg-bg)] p-2">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          className="hg-btn text-xs"
          disabled={currentPage === 0}
          onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
        >
          ← Prev
        </button>
        <p className="text-xs text-[var(--hg-text-secondary)]">
          Page {currentPage + 1} / {pages.length}
        </p>
        <button
          type="button"
          className="hg-btn text-xs"
          disabled={currentPage >= pages.length - 1}
          onClick={() => setCurrentPage((p) => Math.min(pages.length - 1, p + 1))}
        >
          Next →
        </button>
      </div>

      <button
        type="button"
        className="block w-full cursor-zoom-in"
        onClick={() => setZoomed(true)}
      >
        <img
          src={current}
          alt={`TIFF page ${currentPage + 1}`}
          className="w-full h-auto border border-[var(--hg-border)]"
        />
      </button>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85"
          onClick={() => setZoomed(false)}
        >
          <img
            src={current}
            alt={`TIFF page ${currentPage + 1} zoomed`}
            className="max-w-[90vw] max-h-[90vh] border border-[var(--hg-border)]"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
