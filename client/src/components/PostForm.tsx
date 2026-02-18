import { useState, useImperativeHandle, forwardRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useCreateThreadMutation, usePostReplyMutation } from '@/store/apiSlice'

export interface PostFormProps {
    slug?: string;
    boardSlug?: string; // Alias for slug to support legacy usages
    threadId?: number;
    type?: string;      // Ignored logically but kept for prop compatibility
}

export interface PostFormHandle {
    setContent: (v: string) => void;
}

export const PostForm = forwardRef<PostFormHandle, PostFormProps>(({ slug, boardSlug, threadId }, ref) => {
    // Determine the actual slug to use
    const finalSlug = slug || boardSlug || '';

    const [subject, setSubject] = useState('')
    const [content, setContent] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const navigate = useNavigate()

    useImperativeHandle(ref, () => ({
        setContent: (v: string) => setContent(v)
    }));

    const [createThread, { isLoading: isCreating }] = useCreateThreadMutation()
    const [postReply, { isLoading: isReplying }] = usePostReplyMutation()

    const isLoading = isCreating || isReplying

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!finalSlug) {
            console.error("No board slug provided")
            return
        }

        const formData = new FormData()
        if (subject) formData.append('subject', subject)
        formData.append('content', content)
        if (file) formData.append('file', file)

        try {
            if (threadId) {
                // Reply mode
                await postReply({ slug: finalSlug, id: threadId, formData }).unwrap()
                setContent('')
                setFile(null)
                setSubject('')
                // Usually the query hook will auto-refetch due to tag invalidation
            } else {
                // Thread creation mode
                const res = await createThread({ slug: finalSlug, formData }).unwrap()
                navigate(`/${finalSlug}/thread/${res.thread_id}`)
            }
        } catch (err) {
            console.error("Failed to post:", err)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
            {!threadId && (
                <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                        id="subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Thread subject (optional)"
                        disabled={isLoading}
                    />
                </div>
            )}

            <div className="grid w-full gap-1.5">
                <Label htmlFor="content">Comment</Label>
                <Textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Type your message here."
                    required={!file} // Content required if no file
                    disabled={isLoading}
                />
            </div>

            <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="file">Image</Label>
                <Input
                    id="file"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                        const files = e.target.files
                        if (files && files.length > 0) {
                            setFile(files[0])
                        }
                    }}
                    disabled={isLoading}
                />
            </div>

            <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Posting...' : (threadId ? 'Post Reply' : 'Create Thread')}
            </Button>
        </form>
    )
})

PostForm.displayName = "PostForm"

export default PostForm
