import type { Combo } from '../types'
import { mergeCharacters, useStore } from '../store/useStore'
import type { SharedCombo } from './share'

/** 共有されたコンボを自分のメモ帳へ取り込む。未知のキャラ・状況は自動で追加 */
export function importShared(list: SharedCombo[]): number {
  const st = useStore.getState()
  const combos: Omit<Combo, 'id' | 'createdAt' | 'updatedAt'>[] = list.map((s) => {
    let chars = mergeCharacters(useStore.getState())
    let ch = chars.find((c) => c.id === s.characterId) ?? chars.find((c) => c.name === s.charName)
    if (!ch) {
      ch = st.addCustomCharacter(s.charName || '不明なキャラ', s.charName, '#8b95a7')
      chars = mergeCharacters(useStore.getState())
    }
    const sit = s.situationLabel ? st.addSituation(s.situationLabel) : st.situations[0]
    const { charName: _n, situationLabel: _l, ...rest } = s
    // キャラ ID が変わった場合、技 ID は対応しないので外してラベル表示にする
    const route = ch.id === s.characterId ? rest.route : rest.route.map((r) => ({ ...r, moveId: undefined }))
    return { ...rest, route, characterId: ch.id, situation: sit.id, favorite: false, source: 'shared' as const }
  })
  return useStore.getState().importCombos(combos as Combo[])
}
