import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider, useLocation } from 'react-router-dom'
import './index.css'
import { Layout } from './components/Layout'
import { ErrorPage } from './components/ErrorPage'
import CharacterSelect from './pages/CharacterSelect'
import CharacterPage from './pages/CharacterPage'
import ComboEditor from './pages/ComboEditor'
import AllCombos from './pages/AllCombos'
import ShareView from './pages/ShareView'
import DataPage from './pages/DataPage'
import { STUDIO_ENABLED } from './studio/flag'

// AI 認識は重いので遅延読み込み（通常のメモ帳機能の起動を遅くしない）
const AiRecognize = lazy(() => import('./pages/AiRecognize'))
const ai = (
  <Suspense fallback={<p className="text-ink-3">読み込み中…</p>}>
    <AiRecognize />
  </Suspense>
)

/** 遷移ごとにエディタを作り直す（別キャラ・別コンボへの直接遷移で入力状態が残らないように） */
function EditorRoute() {
  const loc = useLocation()
  return <ComboEditor key={`${loc.pathname}|${loc.key}`} />
}

// 開発者向けの学習スタジオ。一般向けビルドでは STUDIO_ENABLED が false になり、コードごと除外される
const StudioPage = STUDIO_ENABLED ? lazy(() => import('./studio/StudioPage')) : null
const studioRoutes = StudioPage
  ? [
      { path: '/studio', element: <Suspense fallback={null}><StudioPage /></Suspense> },
      { path: '/studio/:charId', element: <Suspense fallback={null}><StudioPage /></Suspense> },
    ]
  : []

const router = createHashRouter([
  {
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/', element: <CharacterSelect /> },
      { path: '/combos', element: <AllCombos /> },
      { path: '/c/:charId', element: <CharacterPage /> },
      { path: '/c/:charId/new', element: <EditorRoute /> },
      { path: '/c/:charId/edit/:comboId', element: <EditorRoute /> },
      { path: '/c/:charId/ai', element: ai },
      { path: '/ai', element: ai },
      { path: '/share', element: <ShareView /> },
      { path: '/data', element: <DataPage /> },
      ...studioRoutes,
      { path: '*', element: <ErrorPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
