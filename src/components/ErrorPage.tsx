import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

export function ErrorPage() {
  const err = useRouteError()
  const notFound = !err || (isRouteErrorResponse(err) && err.status === 404)
  return (
    <div className="mx-auto mt-24 max-w-md space-y-4 p-6 text-center">
      <p className="font-display text-4xl font-bold tracking-widest text-accent">{notFound ? '404' : 'ERROR'}</p>
      <p className="text-ink-2">{notFound ? 'ページが見つかりません。' : '画面の表示中にエラーが発生しました。データは保存されたままです。'}</p>
      {!notFound && err instanceof Error && <pre className="overflow-auto rounded bg-panel p-3 text-left text-xs text-ink-3">{err.message}</pre>}
      <div className="flex justify-center gap-2">
        <a className="btn" href="#/">
          トップへ
        </a>
        <button className="btn" onClick={() => location.reload()}>
          再読み込み
        </button>
      </div>
    </div>
  )
}
