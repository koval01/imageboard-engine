import type { BoardStat } from '@/types/api'

export const BOARD_GROUPS: { id: string; title: string; slugs: string[] }[] = [
    { id: 'misc', title: 'Різне', slugs: ['m'] },
    { id: 'pol', title: 'Політика', slugs: ['pol'] },
    { id: 'theme', title: 'Тематика', slugs: ['tech'] },
    { id: 'jp', title: 'Японська культура', slugs: ['a'] },
    { id: 'adult', title: 'Дорослим', slugs: ['sex'] },
]

export function groupBoards(boards: BoardStat[]) {
    const used = new Set<string>()
    const groups = BOARD_GROUPS.map((group) => {
        const items = group.slugs
            .map((slug) => boards.find((b) => b.model.slug === slug))
            .filter((b): b is BoardStat => Boolean(b))
        items.forEach((b) => used.add(b.model.slug))
        return { ...group, items }
    }).filter((g) => g.items.length > 0)

    const rest = boards.filter((b) => !used.has(b.model.slug))
    if (rest.length) {
        groups.push({ id: 'other', title: 'Інше', slugs: rest.map((b) => b.model.slug), items: rest })
    }
    return groups
}
