import { useState, useRef } from 'react'
import { useCreateThreadMutation, usePostReplyMutation } from '@/store/apiSlice'
import { Loader2, ImagePlus, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

interface PostFormProps {
    boardSlug: string
    threadId?: number
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
        if (!content.trim() && (!files || files.length === 0)) {
            toast.error("Please enter text or attach an image.")
            return
        }

        const formData = new FormData()
        formData.append('content', content)
        if (!threadId && subject) formData.append('subject', subject)

        if (files) {
            for (let i = 0; i < files.length; i++) {
                formData.append('file', files[i])
            }
        }

        const promise = threadId
            ? postReply({ slug: boardSlug, id: threadId, formData }).unwrap()
            : createThread({ slug: boardSlug, formData }).unwrap()

        toast.promise(promise, {
            loading: 'Solving Proof of Work & Uploading...',
            success: () => {
                setContent('')
                setSubject('')
                setFiles(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
                if (onSuccess) onSuccess()
                return threadId ? "Reply posted successfully!" : "Thread created successfully!"
            },
            error: (err) => {
                console.error(err)
                return `Failed: ${err?.data?.error || "Unknown error"}`
            }
        })
    }

    return (
        <div className={cn(
            "rounded-xl border bg-card p-4 shadow-sm transition-all duration-300",
            isLoading && "opacity-80 pointer-events-none grayscale-[0.5]"
        )}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex flex-col gap-3">
                    {!threadId && (
                        <input
                            type="text"
                            placeholder="Subject"
                            value={subject}
                            disabled={isLoading}
                            onChange={(e) => setSubject(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-muted/30 px-3 py-1 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    )}

                    <textarea
                        placeholder={threadId ? "Write a reply..." : "Thread content..."}
                        value={content}
                        disabled={isLoading}
                        onChange={(e) => setContent(e.target.value)}
                        rows={threadId ? 3 : 5}
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:bg-background disabled:cursor-not-allowed disabled:opacity-50 resize-y allow-select"
                    />
                </div>

                {/* File Previews */}
                <AnimatePresence>
                    {files && files.length > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="flex gap-2 overflow-hidden"
                        >
                            {Array.from(files).map((file, i) => (
                                <div key={i} className="relative rounded-md border bg-background p-1">
                                    <div className="text-[10px] truncate max-w-[100px] text-muted-foreground">{file.name}</div>
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() => { setFiles(null); if(fileInputRef.current) fileInputRef.current.value='' }}
                                className="text-destructive hover:bg-destructive/10 rounded-full p-1"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            multiple
                            accept="image/*"
                            disabled={isLoading}
                            onChange={(e) => setFiles(e.target.files)}
                            className="hidden"
                            id={`file-upload-${threadId || 'new'}`}
                        />
                        <label
                            htmlFor={`file-upload-${threadId || 'new'}`}
                            className={cn(
                                "inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                                isLoading && "pointer-events-none opacity-50"
                            )}
                        >
                            <ImagePlus className="h-4 w-4" />
                            {files && files.length > 0 ? <span className="text-primary font-bold">{files.length} attached</span> : "Attach Images"}
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={cn(
                            "inline-flex items-center justify-center whitespace-nowrap rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                            isLoading && "cursor-wait"
                        )}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <Send className="mr-2 h-4 w-4" />
                                {threadId ? "Reply" : "Post"}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    )
}
