import type { Classifier } from '../types'

/**
 * 未実装の解析方法。UI に「計画中」として表示するためだけの定義。
 * 実装するときは classify を実装し、status を 'experimental' / 'available' に変えて registry に登録する。
 */
const notImplemented = () => {
  throw new Error('not implemented')
}

export const plannedClassifiers: Classifier[] = [
  {
    id: 'input-ocr',
    name: '入力履歴の OCR',
    description: 'トレーニングモードの入力表示を読み取り、コマンドから技を推定します（最も精度が期待できる方式）。',
    status: 'planned',
    classify: notImplemented,
  },
  {
    id: 'pose',
    name: '姿勢推定（MediaPipe / MoveNet）',
    description: 'キャラの骨格の動きから攻撃モーションを分類します。ゲームキャラへの適用は要検証です。',
    status: 'planned',
    classify: notImplemented,
  },
  {
    id: 'onnx',
    name: '専用モデル（ONNX Runtime Web）',
    description: 'SF6 の映像で学習した行動認識モデルをブラウザで動かします。ラベル付きデータセットが必要です。',
    status: 'planned',
    classify: notImplemented,
  },
  {
    id: 'llm',
    name: 'マルチモーダル LLM API',
    description: '区間のフレームをサーバー経由で API に送り、技の候補を返してもらいます。バックエンドと API キーが必要です。',
    status: 'planned',
    classify: notImplemented,
  },
]
