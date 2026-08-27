import { useEffect, useRef, useState } from 'react'
import { useCreateThreadMutation, usePostReplyMutation } from '@/store/api/boardApi'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import IbSpinner from '@/components/common/IbSpinner'

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

interface PostFormProps {
    boardSlug: string
    threadId?: number
    onSuccess?: () => void
    submitLabel?: string
    fileInputId?: string
    placeholder?: string
    quoteInsert?: string
    onQuoteConsumed?: () => void
}

function wrapSelection(textarea: HTMLTextAreaElement, before: string, after: string) {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const value = textarea.value
    const selected = value.slice(start, end)
    return {
        next: value.slice(0, start) + before + selected + after + value.slice(end),
        caret: start + before.length + selected.length + after.length,
    }
}

export default function PostForm({
    boardSlug,
    threadId,
    onSuccess,
    submitLabel,
    fileInputId,
    placeholder,
    quoteInsert,
    onQuoteConsumed,
}: PostFormProps) {
    const [subject, setSubject] = useState('')
    const [content, setContent] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const textRef = useRef<HTMLTextAreaElement>(null)
    const [dragOver, setDragOver] = useState(false)

    const [createThread, { isLoading: isCreating }] = useCreateThreadMutation()
    const [postReply, { isLoading: isReplying }] = usePostReplyMutation()
    const isLoading = isCreating || isReplying

    const inputId = fileInputId || `file-upload-${threadId || 'new'}`
    const sendLabel = submitLabel || (threadId ? 'Надіслати' : 'Створити')
    const textPlaceholder = placeholder || (threadId ? 'Написати відповідь...' : 'Текст треду...')
    const remaining = Math.max(0, 15000 - content.length)

    useEffect(() => {
        if (!quoteInsert) return
        setContent((prev) => `${prev}${prev.length && !prev.endsWith('\n') ? '\n' : ''}${quoteInsert}`)
        onQuoteConsumed?.()
        requestAnimationFrame(() => textRef.current?.focus())
        // eslint-disable-next-line react-hooks/exhaustive-deps -- consume a one-shot quote insert
    }, [quoteInsert])

    const addFiles = (list: FileList | File[] | null) => {
        if (!list) return
        const next = Array.from(list).filter((file) => {
            if (file.type && !ALLOWED_IMAGE_TYPES.has(file.type)) {
                toast.error('Лише JPEG, PNG, WebP або GIF.')
                return false
            }
            if (file.size > MAX_IMAGE_BYTES) {
                toast.error('Файл завеликий (макс. 5 МБ).')
                return false
            }
            return true
        })
        if (!next.length) return
        setFiles((prev) => [...prev, ...next].slice(0, 4))
    }

    const insertTag = (before: string, after: string) => {
        const el = textRef.current
        if (!el) {
            setContent((prev) => prev + before + after)
            return
        }
        const { next, caret } = wrapSelection(el, before, after)
        setContent(next)
        requestAnimationFrame(() => {
            el.focus()
            el.setSelectionRange(caret, caret)
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!content.trim() && files.length === 0) {
            toast.error('Введіть текст або прикріпіть зображення.')
            return
        }

        const formData = new FormData()
        formData.append('content', content)
        if (!threadId && subject) formData.append('subject', subject)
        for (const file of files) formData.append('file', file)

        const promise = threadId
            ? postReply({ slug: boardSlug, id: threadId, formData }).unwrap()
            : createThread({ slug: boardSlug, formData }).unwrap()

        toast.promise(promise, {
            loading: 'Вирішення PoW та публікація...',
            success: () => {
                setContent('')
                setSubject('')
                setFiles([])
                if (fileInputRef.current) fileInputRef.current.value = ''
                onSuccess?.()
                return threadId ? 'Відповідь успішно надіслано!' : 'Тред успішно створено!'
            },
            error: (err) => `Помилка: ${err?.data?.error || 'Невідома помилка'}`,
        })
    }

    return (
        <div
            id={threadId ? 'reply-form' : 'post-form'}
            className={cn('postform', isLoading && 'pointer-events-none')}
            onPaste={(e) => {
                const pasted = Array.from(e.clipboardData.files).filter((f) => ALLOWED_IMAGE_TYPES.has(f.type))
                if (pasted.length) addFiles(pasted)
            }}
        >
            {isLoading && (
                <div className="ib-overlay">
                    <IbSpinner label="Відправка…" />
                </div>
            )}
            <form onSubmit={handleSubmit}>
                <div className="postform__raw postform__raw_flex">
                    <input
                        type="text"
                        placeholder="опції"
                        disabled={isLoading}
                        className="input postform__input postform__input_m"
                    />
                    <button type="submit" disabled={isLoading} className="button">
                        {sendLabel}
                    </button>
                </div>

                {!threadId && (
                    <div className="postform__raw">
                        <input
                            type="text"
                            placeholder="Тема"
                            value={subject}
                            disabled={isLoading}
                            onChange={(e) => setSubject(e.target.value)}
                            className="input postform__input"
                        />
                    </div>
                )}

                <div className="postform__raw postarea">
                    <textarea
                        ref={textRef}
                        placeholder={textPlaceholder}
                        value={content}
                        disabled={isLoading}
                        onChange={(e) => setContent(e.target.value)}
                        rows={10}
                        maxLength={15000}
                        className="input postform__input postform__comment"
                        onKeyDown={(e) => {
                            if (e.ctrlKey && e.key === 'Enter') {
                                e.currentTarget.form?.requestSubmit()
                            }
                        }}
                    />
                    <div className="postform__limits">4 файли / <span className="postform__len">{remaining}</span></div>
                </div>

                <div className="postform__raw postform__mu-group">
                    <button type="button" className="postform__mu" onClick={() => insertTag('[b]', '[/b]')}><b>B</b></button>
                    <button type="button" className="postform__mu" onClick={() => insertTag('[i]', '[/i]')}><i>I</i></button>
                    <button type="button" className="postform__mu" onClick={() => insertTag('>', '')}>&gt;</button>
                    <button type="button" className="postform__mu" onClick={() => insertTag('[u]', '[/u]')}><span className="u">U</span></button>
                    <button type="button" className="postform__mu" onClick={() => insertTag('[s]', '[/s]')}><s>S</s></button>
                    <button type="button" className="postform__mu" onClick={() => insertTag('[spoiler]', '[/spoiler]')}>??</button>
                </div>

                {files.length > 0 && (
                    <div className="postform__raw flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {files.map((file, i) => (
                            <span key={i}>{file.name}</span>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                setFiles([])
                                if (fileInputRef.current) fileInputRef.current.value = ''
                            }}
                            className="text-destructive"
                            aria-label="Прибрати файли"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}

                <div className="postform__raw filer">
                    <input
                        type="file"
                        ref={fileInputRef}
                        multiple
                        accept={IMAGE_ACCEPT}
                        disabled={isLoading}
                        onChange={(e) => addFiles(e.target.files)}
                        className="hidden"
                        id={inputId}
                    />
                    <label
                        htmlFor={inputId}
                        className={cn('filer__drag-area', dragOver && 'filer_over', isLoading && 'pointer-events-none opacity-50')}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault()
                            setDragOver(false)
                            addFiles(e.dataTransfer.files)
                        }}
                    >
                        {files.length > 0 ? `${files.length} долучено` : 'ДОДАТИ ФАЙЛ / CTRL-V'}
                    </label>
                </div>
            </form>
        </div>
    )
}
