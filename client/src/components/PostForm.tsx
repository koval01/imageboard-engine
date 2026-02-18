import { useState } from 'react'
import { usePostReplyMutation, useCreateThreadMutation } from '@/store/apiSlice'
import { useNavigate } from 'react-router-dom'

interface PostFormProps {
    slug: string
    threadId?: number
    onSuccess?: () => void
}

export default function PostForm({ slug, threadId, onSuccess }: PostFormProps) {
    const [subject, setSubject] = useState('')
    const [content, setContent] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [error, setError] = useState<string | null>(null)
    const navigate = useNavigate()

    const [postReply, { isLoading: isReplying }] = usePostReplyMutation()
    const [createThread, { isLoading: isCreating }] = useCreateThreadMutation()

    const isLoading = isReplying || isCreating

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        const formData = new FormData()
        if (subject) formData.append('subject', subject)
        formData.append('content', content)
        if (file) formData.append('file', file)

        try {
            if (threadId) {
                // Reply Mode
                await postReply({ slug, id: threadId, formData }).unwrap()
                setContent('')
                setFile(null)
                if (onSuccess) onSuccess()
            } else {
                // New Thread Mode
                const res = await createThread({ slug, formData }).unwrap()
                navigate(`/${slug}/thread/${res.thread_id}`)
            }
        } catch (err: any) {
            console.error(err)
            setError(err.data?.error || 'Something went wrong')
        }
    }

    return (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 rounded-md shadow-sm mb-6 max-w-2xl mx-auto">
            <h3 className="font-bold text-lg mb-4 text-center">
                {threadId ? 'Post a Reply' : 'Create New Thread'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
                {!threadId && (
                    <input
                        type="text"
                        placeholder="Subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded bg-transparent focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                )}

                <textarea
                    placeholder="Comment"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={4}
                    className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded bg-transparent focus:ring-1 focus:ring-blue-500 outline-none font-mono text-sm"
                    required={!file} // Content required if no file
                />

                <div className="flex items-center gap-4">
                    <input
                        type="file"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-neutral-100 file:text-neutral-700 hover:file:bg-neutral-200 dark:file:bg-neutral-800 dark:file:text-neutral-300"
                        accept="image/*"
                    />
                </div>

                {error && (
                    <div className="text-red-500 text-sm font-medium p-2 bg-red-50 dark:bg-red-900/20 rounded">
                        Error: {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {isLoading ? 'Posting...' : 'Submit'}
                </button>
            </form>
        </div>
    )
}