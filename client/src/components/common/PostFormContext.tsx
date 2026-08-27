import { createContext, useCallback, useContext, useMemo, useState } from 'react'

interface PostFormCtx {
    open: boolean
    setOpen: (open: boolean) => void
    toggle: () => void
    quoteInsert: string
    setQuoteInsert: (value: string) => void
    consumeQuote: () => void
}

const PostFormContext = createContext<PostFormCtx | null>(null)

export function PostFormProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false)
    const [quoteInsert, setQuoteInsert] = useState('')
    const toggle = useCallback(() => setOpen((v) => !v), [])
    const consumeQuote = useCallback(() => setQuoteInsert(''), [])
    const value = useMemo(
        () => ({ open, setOpen, toggle, quoteInsert, setQuoteInsert, consumeQuote }),
        [open, toggle, quoteInsert],
    )
    return <PostFormContext.Provider value={value}>{children}</PostFormContext.Provider>
}

export function usePostForm() {
    const ctx = useContext(PostFormContext)
    return (
        ctx ?? {
            open: false,
            setOpen: () => undefined,
            toggle: () => undefined,
            quoteInsert: '',
            setQuoteInsert: () => undefined,
            consumeQuote: () => undefined,
        }
    )
}
