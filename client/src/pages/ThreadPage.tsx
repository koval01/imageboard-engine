import { useParams, Link } from 'react-router-dom'
import { useGetThreadQuery } from '@/store/apiSlice'
import PostForm from '@/components/PostForm'
import ImageViewer from '@/components/ImageViewer'
import { Loader2, ArrowLeft, RotateCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { motion } from 'framer-motion'

export default function ThreadPage() {
    const { slug, id } = useParams<{ slug: string; id: string }>()
    const threadId = parseInt(id || '0', 10)

    const { data, isLoading, error, refetch, isFetching } = useGetThreadQuery(
        { slug: slug!, id: threadId },
        {
            skip: !slug || !threadId,
            pollingInterval: 10000 // Poll every 10s
        }
    )

    if (isLoading) return <div className="flex h-[50vh] flex-col items-center justify-center gap-2"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-muted-foreground animate-pulse">Loading thread...</p></div>
    if (error) return <div className="p-12 text-center rounded-lg border border-destructive/20 bg-destructive/5 text-destructive">Thread not found or deleted.</div>
    if (!data) return null

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <Link to={`/${slug}`} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Return to /{slug}/
                </Link>
                <button onClick={refetch} disabled={isFetching} className="inline-flex items-center text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
                    <RotateCw className={`mr-1 h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
                    {isFetching ? 'Updating...' : 'Refresh'}
                </button>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
            >
                {/* OP Post */}
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="bg-primary/5 px-6 py-4 border-b border-border/50">
                        <div className="flex flex-wrap items-baseline gap-3">
                            {data.thread.subject && <h1 className="text-xl font-bold text-primary">{data.thread.subject}</h1>}
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span className="font-semibold text-green-600 dark:text-green-500">Anonymous</span>
                                <span>•</span>
                                <span>{formatDistanceToNow(new Date(data.thread.created_at))} ago</span>
                                <span>•</span>
                                <span className="font-mono">No. {data.thread.id}</span>
                                {data.admin_role > 0 && <span className="text-[10px] font-black text-red-500 bg-red-100 dark:bg-red-900/30 px-1 rounded ml-1">ADMIN</span>}
                            </div>
                        </div>
                    </div>

                    <div className="p-6 grid gap-8 md:grid-cols-[1fr_minmax(200px,300px)]">
                        <div className="order-2 md:order-1 text-base leading-7 whitespace-pre-wrap allow-select">
                            {data.thread.content}
                        </div>

                        <div className="order-1 md:order-2">
                            <ImageViewer images={data.op_images} cdnUrl={data.cdn_url} />
                        </div>
                    </div>
                </div>

                {/* Replies */}
                <div className="space-y-3 relative before:absolute before:left-6 before:top-0 before:bottom-0 before:w-px before:bg-border/50 pl-0 md:pl-6">
                    {data.replies.map((post) => (
                        <div key={post.model.id} id={`p${post.model.id}`} className="group relative pl-8">
                            {/* Connector dot */}
                            <div className="absolute left-4 top-6 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-background bg-border group-hover:bg-primary transition-colors" />

                            <div className="rounded-lg border bg-muted/10 p-4 transition-all hover:bg-card hover:shadow-md hover:border-primary/20">
                                <div className="flex items-center justify-between mb-3 border-b border-border/30 pb-2">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span className="font-bold text-foreground">Anonymous</span>
                                        <span>{formatDistanceToNow(new Date(post.model.created_at))} ago</span>
                                        <Link to={`#p${post.model.id}`} className="hover:underline hover:text-primary">No. {post.model.id}</Link>
                                        {post.admin_role > 0 && <span className="text-red-500 font-bold text-[10px]">## Admin</span>}
                                    </div>
                                </div>

                                <div className="grid gap-4">
                                    {post.images.length > 0 && (
                                        <div><ImageViewer images={post.images} cdnUrl={data.cdn_url} /></div>
                                    )}
                                    <div className="whitespace-pre-wrap text-sm leading-relaxed allow-select text-foreground/90">
                                        {post.model.content}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Reply Form */}
            <div className="sticky bottom-6 z-40 mx-auto max-w-3xl">
                <div className="absolute -inset-4 bg-gradient-to-t from-background via-background to-transparent -z-10 pointer-events-none" />
                <PostForm boardSlug={slug!} threadId={threadId} onSuccess={() => refetch()} />
            </div>
        </div>
    )
}
