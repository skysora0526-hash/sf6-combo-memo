import type { Classifier, Segmenter } from './types'
import { motionSegmenter } from './analyzers/motion'
import { templateClassifier } from './analyzers/template'
import { plannedClassifiers } from './analyzers/planned'

/** 解析器の登録場所。新しい方式はここに追加する */
export const SEGMENTERS: Segmenter[] = [motionSegmenter]
export const CLASSIFIERS: Classifier[] = [templateClassifier, ...plannedClassifiers]

/** この信頼度以上の候補だけを「AI の推定」として初期選択する（それでも確定はユーザー） */
export const SUGGEST_THRESHOLD = 0.75
