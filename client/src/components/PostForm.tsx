import { useState, useRef } from 'react'
import { useCreateThreadMutation, usePostReplyMutation } from '@/store/apiSlice'
import { Loader2, ImagePlus, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PostFormProps {
    boardSlug: string
    threadId?: number // If present, it's a reply
    onSuccess?: () => void
}

export default function PostForm({ boardSlug, threadId, onSuccess }: PostFormProps) {
    const [subject, setSubject] = useState('')
    const [content, setContent] = useState('')
    const [files, setFiles] = useState<FileList | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [createThread, { isLoading: isCreating }] = useCreateThreadMutation()
    const [postReply, { isLoading: isReplying }] = usePostReplyMutation()

    const isLoading = isCreating || isReplying

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!content && (!files || files.length === 0)) return

        const formData = new FormData()
        formData.append('content', content)
        if (!threadId && subject) formData.append('subject', subject)

        if (files) {
            for (let i = 0; i < files.length; i++) {
                formData.append('file', files[i])
            }
        }

        try {
            if (threadId) {
                await postReply({ slug: boardSlug, id: threadId, formData }).unwrap()
            } else {
                await createThread({ slug: boardSlug, formData }).unwrap()
            }

            // Reset form
            setContent('')
            setSubject('')
            setFiles(null)
            if (fileInputRef.current) fileInputRef.current.value = ''
            if (onSuccess) onSuccess()

        } catch (err) {
            console.error("Failed to post:", err)
            alert("Error posting content. Check console.")
        }
    }

    return (
        <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="space-y-4">
                {!threadId && (
                    <input
                        type="text"
                        placeholder="Subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                )}

                <textarea
                    placeholder={threadId ? "Write a reply..." : "Thread content..."}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={4}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            multiple
                            accept="image/*"
                            onChange={(e) => setFiles(e.target.files)}
                            className="hidden"
                            id="file-upload"
                        />
                        <label
                            htmlFor="file-upload"
                            className="inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        >
                            <ImagePlus className="h-4 w-4" />
                            {files && files.length > 0 ? `${files.length} images` : "Add Images"}
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={cn(
                            "inline-flex items-center justify-center whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                            isLoading && "cursor-wait"
                        )}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                PoW Solving...
                            </>
                        ) : (
                            <>
                                <Send className="mr-2 h-4 w-4" />
                                {threadId ? "Reply" : "Create Thread"}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </form>
    )
}
