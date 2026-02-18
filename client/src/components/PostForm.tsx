// client/src/components/PostForm.tsx
import { useState, useImperativeHandle, forwardRef, useRef } from 'react'
import { useCreateThreadMutation, usePostReplyMutation } from '@/store/apiSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

interface PostFormProps {
    boardSlug: string
    threadId?: number
    type: 'thread' | 'reply'
}

const PostForm = forwardRef<{ setContent: (v: string) => void }, PostFormProps>(({ boardSlug, threadId, type }, ref) => {
    const [subject, setSubject] = useState('')
    const [content, setContent] = useState('')
    const [file, setFile] = useState<File | null>(null)

    // Use uncontrolled input for file reset hack
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [createThread, { isLoading: isCreating }] = useCreateThreadMutation()
    const [postReply, { isLoading: isReplying }] = usePostReplyMutation()

    const isLoading = isCreating || isReplying

    useImperativeHandle(ref, () => ({
        setContent: (val: string) => setContent(prev => prev + val)
    }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const formData = new FormData()
        formData.append('content', content)
        if (file) formData.append('file', file)

        try {
            if (type === 'thread') {
                formData.append('subject', subject)
                const res = await createThread({ slug: boardSlug, formData }).unwrap()
                // Optional: Redirect to new thread or refresh
                window.location.href = `/${boardSlug}/thread/${res.thread_id}`
            } else if (threadId) {
                await postReply({ slug: boardSlug, id: threadId, formData }).unwrap()
                // Reset form
                setContent('')
                setFile(null)
                if(fileInputRef.current) fileInputRef.current.value = ''
            }
        } catch (err) {
            console.error("Failed to post:", err)
            alert("Error submitting post. Check console.")
        }
    }

    return (
        <Card className="w-full max-w-lg shadow-sm">
            <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                    {type === 'thread' && (
                        <div className="space-y-2">
                            <Label htmlFor="subject">Subject</Label>
                            <Input
                                id="subject"
                                placeholder="Thread Subject"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="content">Comment</Label>
                        <Textarea
                            id="content"
                            placeholder="Type your message..."
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={5}
                            className="resize-y"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="file">Image</Label>
                        <Input
                            id="file"
                            type="file"
                            accept="image/*"
                            ref={fileInputRef}
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {type === 'thread' ? 'Start Thread' : 'Post Reply'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
})

export default PostForm
