import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { api } from '../lib/api'
import { Img, Modal } from './ui'
import { usePrefs } from '../context/Prefs'
import PurchasePanel from './PurchasePanel'
import { imagesFor } from '../lib/product'

export default function QuickView({ slug, onClose }) {
  const { t, pick } = usePrefs()
  const [p, setP] = useState(null)
  const [colorId, setColorId] = useState(null)
  const [idx, setIdx] = useState(0)
  useEffect(() => { api(`/api/products/${slug}`).then(setP).catch(() => onClose()) }, [slug]) // eslint-disable-line
  const imgs = imagesFor(p, colorId)
  useEffect(() => setIdx(0), [colorId])

  return (
    <Modal open onClose={onClose} label={t('card.quickView')}>
      {!p ? (
        <div className="grid gap-6 p-6 md:grid-cols-2"><div className="skeleton aspect-square" /><div className="space-y-3"><div className="skeleton h-4 w-20" /><div className="skeleton h-8 w-3/4" /><div className="skeleton h-40" /></div></div>
      ) : (
        <div className="grid gap-6 p-4 sm:p-6 md:grid-cols-2 md:gap-8">
          <div>
            <Img image={imgs[idx]} alt={pick(p, 'name')} className="aspect-square rounded-2xl" sizes="(min-width:768px) 420px, 90vw" priority />
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
              {imgs.map((im, i) => (
                <button key={im.id} onClick={() => setIdx(i)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${i === idx ? 'border-ink' : 'border-transparent'}`}>
                  <Img image={im} className="h-full w-full" sizes="64px" />
                </button>
              ))}
            </div>
          </div>
          <div className="pb-4">
            <PurchasePanel product={p} colorId={colorId} onColorChange={setColorId} compact onAdded={onClose} />
            <Link to={`/product/${p.slug}`} onClick={onClose} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">
              {t('card.fullDetails')} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}
    </Modal>
  )
}
