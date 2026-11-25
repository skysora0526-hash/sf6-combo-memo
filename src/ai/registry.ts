import type { Classifier, Segmenter } from './types'
import { motionSegmenter } from './analyzers/motion'
import { templateClassifier } from './analyzers/template'
import { bundledModelClassifier } from './analyzers/bundled'
import { plannedClassifiers } from './analyzers/planned'

/** 解析器の登録場所。新しい方式はここに追加する */
export const SEGMENTERS: Segmenter[] = [motionSegmenter]
export const CLASSIFIERS: Classifier[] = [bundledModelClassifier, templateClassifier, ...plannedClassifiers]

/** この信頼度以上の候補だけを「AI の推定」として初期選択する（それでも確定はユーザー） */
export const SUGGEST_THRESHOLD = 0.75

/** 候補の出どころの表示名 */
export const SOURCE_LABEL: Record<string, string> = { bundled: '開発者', template: 'あなた', studio: '学習中データ' }
