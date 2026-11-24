import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { EMPTY_FILTER } from '../lib/filter'
import { ComboList } from '../components/ComboList'
import { ShareDialog } from '../components/ShareDialog'

export default function AllCombos() {
  const combos = useStore((s) => s.combos)
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [share, setShare] = useState<string[] | null>(null)
  return (
    <div className="space-y-4">
      <div>
        <p className="font-display text-xs font-bold tracking-[0.3em] text-accent">ALL COMBOS</p>
        <h1 className="text-2xl font-bold">全コンボ</h1>
      </div>
      <ComboList
        combos={combos}
        filter={filter}
        setFilter={setFilter}
        showChar
        onShare={setShare}
        emptyAction={
          <Link to="/" className="btn btn-primary">
            キャラを選んでコンボを登録
          </Link>
        }
      />
      <ShareDialog ids={share} onClose={() => setShare(null)} />
    </div>
  )
}
