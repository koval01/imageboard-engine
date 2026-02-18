import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useGetBoardQuery, useCreateThreadMutation } from "@/store/apiSlice"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, MessageSquare, Image as ImageIcon } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export default function BoardPage() {
    const { slug } = useParams<{ slug: string }>()
    const { data, isLoading } = useGetBoardQuery(slug || "")
    const [createThread, { isLoading: isCreating }] = useCreateThreadMutation()

    // Form State
    const [subject, setSubject] = useState("")
    const [content, setContent] = useState("")
    const [file, setFile] = useState<File | null>(null)
    const [showForm, setShowForm] = useState(false)

    if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
    if (!data || !slug) return <div>Board not found</div>

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!content || !file) return

        const formData = new FormData()
        if (subject) formData.append("subject", subject)
        formData.append("content", content)
        formData.append("file", file)

        try {
            await createThread({ slug, formData }).unwrap()
            // Reset form and potentially refetch is handled by tags
            setSubject("")
            setContent("")
            setFile(null)
            setShowForm(false)
        } catch (err) {
            console.error("Failed to post", err)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">/{data.board.slug}/ - {data.board.name}</h1>
                    <p className="text-muted-foreground">{data.board.description}</p>
                </div>
                <Button onClick={() => setShowForm(!showForm)}>
                    {showForm ? "Cancel" : "New Thread"}
                </Button>
            </div>

            {/* New Thread Form */}
            {showForm && (
                <Card className="border-primary/50">
                    <CardHeader><CardTitle>Create New Thread</CardTitle></CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <Input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
                            <Textarea placeholder="Content (Required)" value={content} onChange={e => setContent(e.target.value)} required />
                            <Input type="file" onChange={e => setFile(e.target.files?.[0] || null)} required />
                            <Button type="submit" disabled={isCreating}>
                                {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Post Thread
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Thread List */}
            <div className="space-y-4">
                {data.threads.map(thread => (
                    <Card key={thread.model.id} className="overflow-hidden">
                        <CardContent className="p-4 flex gap-4">
                            {/* OP Image */}
                            {thread.images.length > 0 && (
                                <div className="shrink-0">
                                    <Link to={`/${slug}/thread/${thread.model.id}`}>
                                        <img
                                            src={`${data.cdn_url}/thumb/${thread.images[0].thumbnail_url}`}
                                            className="rounded-md w-32 h-32 object-cover border"
                                            alt="OP"
                                        />
                                    </Link>
                                </div>
                            )}

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 text-sm text-muted-foreground">
                                    <span className="font-bold text-primary">#{thread.model.id}</span>
                                    <span>{formatDistanceToNow(new Date(thread.model.created_at))} ago</span>
                                </div>

                                <Link to={`/${slug}/thread/${thread.model.id}`} className="block group">
                                    {thread.model.subject && (
                                        <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
                                            {thread.model.subject}
                                        </h3>
                                    )}
                                    <div className="text-sm mt-1 whitespace-pre-wrap line-clamp-4">
                                        {thread.model.content}
                                    </div>
                                </Link>

                                <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <MessageSquare className="w-3 h-3" />
                                        {thread.reply_count} Replies
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <ImageIcon className="w-3 h-3" />
                                        {thread.image_count} Images
                                    </div>
                                    {/* Replies Preview (Optional: render tiny previews here) */}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
