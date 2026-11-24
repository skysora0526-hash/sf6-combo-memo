export type MoveCategory =
  | 'normal'
  | 'special'
  | 'unique'
  | 'super'
  | 'drive'
  | 'system'
  | 'connector'
  | 'unknown'

export interface MoveDef {
  id: string
  name: string
  category: MoveCategory
  /** ボタン・ルート表示用の略称（例: 中足） */
  short?: string
  /** テンキー表記（例: 2MK / 236P） */
  numpad?: string
  aliases?: string[]
  driveCost?: number
  saCost?: number
  /** ユーザーが追加した技 */
  custom?: boolean
}

export interface CharacterDef {
  id: string
  name: string
  nameEn: string
  color: string
  order: number
  image?: string
  /** draft = 初期データ（要確認） */
  dataStatus?: 'draft' | 'verified'
  moves: MoveDef[]
  custom?: boolean
}

export interface RouteStep {
  id: string
  /** 技データの ID。直接入力の技・不明な動作は undefined */
  moveId?: string
  /** 保存時点の表示名。技データが変わっても表示が崩れないよう必ず保持 */
  label: string
  category: MoveCategory
  /** OD（EX）版 */
  od?: boolean
  note?: string
  /** AI 認識由来のメタ情報 */
  ai?: { confidence: number; start: number; end: number }
}

export type Difficulty = 1 | 2 | 3 | 4 | 5

export interface Combo {
  id: string
  characterId: string
  name: string
  situation: string
  difficulty: Difficulty
  damage: number | null
  saGauge: number
  driveGauge: number
  route: RouteStep[]
  notes: string
  tags: string[]
  favorite: boolean
  source: 'manual' | 'ai' | 'shared'
  createdAt: number
  updatedAt: number
}

export type Notation = 'name' | 'short' | 'numpad'

export interface Situation {
  id: string
  label: string
}
