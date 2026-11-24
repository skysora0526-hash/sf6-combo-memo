import type { Segmenter } from '../types'
import { adaptiveThreshold, motionEnergy, segmentsFromEnergy, smooth } from '../features'

/**
 * フレーム差分による動作区間の検出。
 * 画面内の変化量が急に増えた区間を「何かの動作」として切り出す。
 * 技名は判定しない（どの技かは分類器かユーザーが決める）。
 * 限界: カメラの移動・ヒットエフェクト・暗転演出でも反応する。2 キャラの区別はしない。
 */
export const motionSegmenter: Segmenter = {
  id: 'motion',
  name: '動作区間の検出（フレーム差分）',
  description: '画面の変化が大きい区間を「動作」として切り出します。技名は判定しません。',
  status: 'available',
  segment(frames, _ctx, { sensitivity }) {
    const times = frames.map((f) => f.t)
    const e = smooth(motionEnergy(frames), 1)
    const thr = adaptiveThreshold(e, sensitivity)
    return segmentsFromEnergy(e, times, thr)
  },
}
