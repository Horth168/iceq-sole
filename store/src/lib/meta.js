// Per-page <title>, description, Open Graph tags, canonical URL and optional JSON-LD.
import { useEffect } from 'react'

function setMeta(attr, key, value) {
  if (!value) return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.setAttribute('content', value)
}

export function useMeta({ title, description, image, jsonLd } = {}) {
  useEffect(() => {
    if (!title) return
    const full = title.includes('IceQ Sole') ? title : `${title} — IceQ Sole`
    document.title = full
    setMeta('name', 'description', description)
    setMeta('property', 'og:title', full)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', window.location.href.split('?')[0])
    if (image) setMeta('property', 'og:image', image)
    const canonical = document.head.querySelector('link[rel=canonical]')
    if (canonical) canonical.href = window.location.origin + window.location.pathname
    let script
    if (jsonLd) {
      script = document.createElement('script')
      script.type = 'application/ld+json'
      script.textContent = JSON.stringify(jsonLd)
      document.head.appendChild(script)
    }
    return () => script?.remove()
  }, [title, description, image, JSON.stringify(jsonLd || null)]) // eslint-disable-line
}
