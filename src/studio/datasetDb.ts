/**
 * 学習スタジオのデータセット（開発者のブラウザの IndexedDB に保存）。
 * サムネイル付きで件数が多くなるため localStorage ではなく IndexedDB を使う。
 */
export interface Sample {
  id: string
  characterId: string
  moveId: string
  label: string
  /** featureCodec の base64 */
  feature: string
  featureVersion: number
  thumb?: string
  video: string
  start: number
  end: number
  roiId: string
  fps: number
  createdAt: number
}

const DB = 'sf6-combo-memo-studio'
const STORE = 'samples'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' })
      s.createIndex('characterId', 'characterId')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB を開けません'))
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => {
      db.close()
      resolve(req ? (req.result as T) : undefined)
    }
    t.onerror = () => reject(t.error)
  })
}

export const listSamples = async (characterId: string): Promise<Sample[]> =>
  ((await tx<Sample[]>('readonly', (s) => s.index('characterId').getAll(characterId))) ?? []).sort((a, b) => a.createdAt - b.createdAt)

export const listAllCounts = async (): Promise<Record<string, number>> => {
  const all = (await tx<Sample[]>('readonly', (s) => s.getAll())) ?? []
  const out: Record<string, number> = {}
  all.forEach((x) => (out[x.characterId] = (out[x.characterId] ?? 0) + 1))
  return out
}

export const putSamples = async (items: Sample[]) => {
  await tx('readwrite', (s) => {
    items.forEach((x) => s.put(x))
  })
}

export const deleteSample = async (id: string) => {
  await tx('readwrite', (s) => s.delete(id))
}

export const clearCharacter = async (characterId: string) => {
  const ids = (await listSamples(characterId)).map((x) => x.id)
  await tx('readwrite', (s) => {
    ids.forEach((id) => s.delete(id))
  })
}
