import { useParams, Link } from 'react-router-dom'
import { useGetBoardQuery } from '@/store/apiSlice'
import PostForm from '@/components/PostForm'
import ImageViewer from '@/components/ImageViewer'
import { Loader2, MessageCircle, Hash } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function BoardPage() {
    const { slug } = useParams<{ slug: string }>()
    const { data, isLoading, error } = useGetBoardQuery(slug || '', { skip: !slug })

    if (isLoading) return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-muted-foreground" /></div>
    if (error) return <div className="p-8 text-center text-destructive">Board not found or API error.</div>
    if (!data) return null

    return (
        <div className="space-y-6">
            {/* Board Header */}
            <div className="rounded-lg border bg-card p-6 text-center">
                <h1 className="text-3xl font-bold">/{data.board.slug}/ - {data.board.name}</h1>
                <p className="text-muted-foreground">{data.board.description}</p>
            </div>

            {/* Create Thread Form */}
            <div className="mx-auto max-w-2xl">
                <PostForm boardSlug={slug!} />
            </div>

            <div className="h-px bg-border" />

            {/* Threads List */}
            <div className="space-y-4">
                {data.threads.map((thread) => (
                    <div key={thread.model.id} className="overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-sm">
                        <div className="bg-muted/30 p-4">
                            <div className="flex flex-wrap items-baseline gap-2 text-sm text-muted-foreground">
                                {thread.model.subject && <span className="font-bold text-foreground text-lg mr-2">{thread.model.subject}</span>}
                                <span className="font-medium text-foreground">Anonymous</span>
                                <span>{formatDistanceToNow(new Date(thread.model.created_at))} ago</span>
                                <span className="flex items-center gap-1"><Hash className="h-3 w-3"/>{thread.model.id}</span>
                                <Link to={`/${slug}/thread/${thread.model.id}`} className="ml-auto text-xs font-medium text-primary hover:underline">
                                    View Thread
                                </Link>
                            </div>
                        </div>

                        <div className="p-4 grid gap-4 md:grid-cols-[200px_1fr]">
                            {/* OP Images */}
                            <div>
                                <ImageViewer images={thread.images} cdnUrl={data.cdn_url} />
                            </div>

                            {/* Content & Replies Preview */}
                            <div className="space-y-4">
                                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                    {thread.model.content}
                                </div>

                                <div className="flex gap-4 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {thread.reply_count} Replies</div>
                                    <div className="flex items-center gap-1"><Loader2 className="h-3 w-3" /> {thread.image_count} Images</div>
                                </div>

                                {/* Reply Previews */}
                                {thread.replies_preview.length > 0 && (
                                    <div className="mt-4 space-y-2 border-l-2 border-muted pl-4">
                                        {thread.omitted_posts > 0 && (
                                            <div className="text-xs text-muted-foreground italic">
                                                {thread.omitted_posts} posts omitted...
                                            </div>
                                        )}
                                        {thread.replies_preview.map((reply) => (
                                            <div key={reply.model.id} className="rounded bg-muted/20 p-2 text-sm">
                                                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                                                    <span className="font-semibold text-foreground">Anonymous</span>
                                                    <span>{formatDistanceToNow(new Date(reply.model.created_at))} ago</span>
                                                    <span>No.{reply.model.id}</span>
                                                </div>
                                                {reply.images.length > 0 && (
                                                    <div className="mb-1 text-xs text-primary">Attached: {reply.images.length} image(s)</div>
                                                )}
                                                <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{reply.model.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
