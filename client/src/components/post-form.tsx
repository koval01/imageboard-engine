import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface PostFormProps {
    onSubmit: (formData: FormData) => Promise<any>
    onCancel?: () => void
    buttonLabel?: string
    loading?: boolean
}

export default function PostForm({ onSubmit, onCancel, buttonLabel = "Post", loading }: PostFormProps) {
    const [content, setContent] = useState('')
    const [file, setFile] = useState<File | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!content.trim() && !file) return

        const formData = new FormData()
        formData.append('content', content)
        if (file) {
            formData.append('file', file)
        }

        await onSubmit(formData)
        setContent('')
        setFile(null)
    }

    return (
        <form onSubmit={handleSubmit} className="bg-muted/30 p-4 border rounded shadow-sm max-w-2xl mx-auto space-y-3">
            <div className="flex flex-col gap-1">
                <label className="text-xs font-bold">Comment</label>
                <textarea
                    className="w-full min-h-[100px] border rounded p-2 text-sm bg-background"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your thoughts..."
                />
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-xs font-bold">File</label>
                <input
                    type="file"
                    className="text-xs"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
            </div>

            <div className="flex justify-between items-center pt-2">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-xs underline"
                    >
                        Close
                    </button>
                )}
                <button
                    type="submit"
                    disabled={loading}
                    className="bg-primary text-primary-foreground px-4 py-1 rounded text-sm font-bold flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
                >
                    {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                    {buttonLabel}
                </button>
            </div>
        </form>
    )
}
