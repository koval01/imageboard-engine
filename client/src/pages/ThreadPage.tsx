import { useParams, Link } from 'react-router-dom'
import { useGetThreadQuery } from '@/store/apiSlice'
import PostForm from '@/components/PostForm'
import ImageViewer from '@/components/ImageViewer'
import { Loader2, ArrowLeft } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function ThreadPage() {
    const { slug, id } = useParams<{ slug: string; id: string }>()
    const threadId = parseInt(id || '0', 10)

    // Polling every 5 seconds for live updates
    const { data, isLoading, error, refetch } = useGetThreadQuery(
        { slug: slug!, id: threadId },
        {
            skip: !slug || !threadId,
            pollingInterval: 5000
        }
    )

    // Scroll to bottom on first load? Maybe not for 8chan style, usually top.
    // But if we want auto-scroll on new posts, we need custom logic.

    if (isLoading) return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-muted-foreground" /></div>
    if (error) return <div className="p-8 text-center text-destructive">Thread not found.</div>
    if (!data) return null

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <Link to={`/${slug}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back to /{slug}/
                </Link>
            </div>

            <div className="space-y-1">
                {/* OP Post */}
                <div className="rounded-lg border bg-card p-4 md:p-6">
                    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
                        <div className="flex items-baseline gap-2">
                            <span className="text-lg font-bold text-primary">{data.thread.subject || 'No Subject'}</span>
                            <span className="font-semibold text-green-600 dark:text-green-400">Anonymous</span>
                            <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(data.thread.created_at))} ago
              </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono">No. {data.thread.id}</span>
                            {data.admin_role > 0 && <span className="text-red-500 font-bold">[ADMIN]</span>}
                        </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
                        {/* Content takes priority */}
                        <div className="order-2 md:order-1">
                            <div className="whitespace-pre-wrap text-base leading-relaxed">
                                {data.thread.content}
                            </div>
                        </div>

                        {/* Images float right or bottom */}
                        <div className="order-1 md:order-2">
                            <ImageViewer images={data.op_images} cdnUrl={data.cdn_url} />
                        </div>
                    </div>
                </div>

                {/* Replies */}
                <div className="space-y-1 py-4">
                    {data.replies.map((post) => (
                        <div key={post.model.id} id={`p${post.model.id}`} className="group flex gap-3 rounded-r-lg border-l-4 border-l-transparent bg-muted/10 p-3 hover:border-l-primary hover:bg-muted/20">
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-semibold text-foreground">Anonymous</span>
                                    <span>{formatDistanceToNow(new Date(post.model.created_at))} ago</span>
                                    <Link to={`#p${post.model.id}`} className="hover:underline">No. {post.model.id}</Link>
                                    {post.model.country_code && post.model.country_code !== 'XX' && (
                                        <span className="rounded bg-background px-1 border uppercase">{post.model.country_code}</span>
                                    )}
                                </div>

                                <div className="ml-4">
                                    <ImageViewer images={post.images} cdnUrl={data.cdn_url} />
                                    <div className="whitespace-pre-wrap text-sm">
                                        {post.model.content}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Reply Form */}
            <div className="sticky bottom-4 mx-auto max-w-2xl">
                <PostForm boardSlug={slug!} threadId={threadId} onSuccess={() => refetch()} />
            </div>
        </div>
    )
}
