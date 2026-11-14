import { Component } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw } from 'lucide-react'
import { usePrefs } from '../context/Prefs'

// A page that throws while rendering would otherwise unmount the whole app and leave a blank screen.
// This catches it and shows a branded message with a way out instead.
// After a deploy, a phone still running the previous version can ask for page files that no longer
// exist ("Failed to fetch dynamically imported module"); reloading once picks up the new version.
const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Loading chunk/i
const KEY = 'iq_reloaded_for_update'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error) {
    let reloaded = false
    try { reloaded = sessionStorage.getItem(KEY) === '1' } catch { /* storage blocked */ }
    if (STALE.test(String(error?.message || error)) && !reloaded) {
      try { sessionStorage.setItem(KEY, '1') } catch { /* storage blocked */ }
      window.location.reload()
      return
    }
    console.error(error)
  }

  componentDidMount() {
    // a clean render means any earlier one-off reload has done its job
    setTimeout(() => { try { if (!this.state.error) sessionStorage.removeItem(KEY) } catch { /* ignore */ } }, 5000)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <Crashed full={this.props.full} />
  }
}

function Crashed({ full }) {
  const { t } = usePrefs()
  const body = (
    <div className="container-x flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-ink/5 text-ink"><RefreshCcw size={24} /></span>
      <h1 className="h-display mt-6 text-4xl sm:text-5xl">{t('crash.title')}</h1>
      <p className="mt-3 max-w-md text-stone-450">{t('crash.text')}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => window.location.reload()} className="btn-primary">{t('crash.retry')}</button>
        {full
          ? <a href="/" className="btn-outline">{t('crash.home')}</a>
          : <Link to="/" className="btn-outline">{t('crash.home')}</Link>}
      </div>
    </div>
  )
  return full ? <div className="min-h-screen bg-bone pt-[env(safe-area-inset-top)] text-ink">{body}</div> : body
}
