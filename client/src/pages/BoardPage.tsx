import { useParams, Link } from 'react-router-dom'
import { useGetBoardQuery } from '@/store/apiSlice'
import PostForm from '@/components/PostForm'
import ImageViewer from '@/components/ImageViewer'
import { Loader2, MessageCircle, ImageIcon, Info, ArrowUpRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { motion } from 'framer-motion'

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05
        }
    }
}

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
}

export default function BoardPage() {
    const { slug } = useParams<{ slug: string }>()
    const { data, isLoading, error } = useGetBoardQuery(slug || '', { skip: !slug })

    if (isLoading) return <div className="flex h-[50vh] flex-col items-center justify-center gap-2"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-muted-foreground animate-pulse">Loading board...</p></div>
    if (error) return <div className="p-12 text-center rounded-lg border border-destructive/20 bg-destructive/5 text-destructive">Failed to load board content.</div>
    if (!data) return null

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
            <div className="space-y-8">
                {/* Mobile Header (only visible on small screens) */}
                <div className="lg:hidden rounded-xl border bg-card p-6 shadow-sm">
                    <h1 className="text-3xl font-bold tracking-tight">/{data.board.slug}/ - {data.board.name}</h1>
                    <p className="text-muted-foreground mt-2">{data.board.description}</p>
                </div>

                {/* Form */}
                <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-1">
                    <PostForm boardSlug={slug!} />
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-border/50">
                    <h2 className="text-lg font-semibold tracking-tight">Active Threads</h2>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">{data.threads.length} threads</span>
                </div>

                {/* Threads List */}
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="space-y-6"
                >
                    {data.threads.map((thread) => (
                        <motion.div
                            key={thread.model.id}
                            variants={item}
                            className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:shadow-md hover:border-primary/20"
                        >
                            <div className="bg-muted/30 px-4 py-3 border-b border-border/50 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-bold text-foreground">Anonymous</span>
                                    <span>•</span>
                                    <span>{formatDistanceToNow(new Date(thread.model.created_at))} ago</span>
                                    <span>•</span>
                                    <span className="font-mono opacity-70">No. {thread.model.id}</span>
                                </div>
                                <Link
                                    to={`/${slug}/thread/${thread.model.id}`}
                                    className="text-xs font-medium text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    Open Thread <ArrowUpRight className="h-3 w-3" />
                                </Link>
                            </div>

                            <div className="p-4 md:p-5 grid gap-6 md:grid-cols-[180px_1fr]">
                                {/* Thread Thumbnail */}
                                <div className="shrink-0">
                                    {thread.images.length > 0 ? (
                                        <div className="relative">
                                            <ImageViewer images={[thread.images[0]]} cdnUrl={data.cdn_url} />
                                            {thread.image_count > 1 && (
                                                <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-sm font-bold">
                                                    +{thread.image_count - 1}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="h-32 w-full rounded-md bg-muted/50 flex items-center justify-center text-muted-foreground/30">
                                            <MessageCircle className="h-10 w-10" />
                                        </div>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex flex-col justify-between gap-4">
                                    <div>
                                        {thread.model.subject && <h3 className="text-lg font-bold text-primary mb-2 leading-tight">{thread.model.subject}</h3>}
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 allow-select">
                                            {thread.model.content}
                                        </div>
                                    </div>

                                    {/* Stats & Replies */}
                                    <div>
                                        <div className="flex gap-4 text-xs font-medium text-muted-foreground mb-3">
                                            <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                                                <MessageCircle className="h-3.5 w-3.5" /> {thread.reply_count} Replies
                                            </div>
                                            {thread.image_count > 0 && (
                                                <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                                                    <ImageIcon className="h-3.5 w-3.5" /> {thread.image_count} Images
                                                </div>
                                            )}
                                        </div>

                                        {thread.replies_preview.length > 0 && (
                                            <div className="space-y-2 relative">
                                                {thread.omitted_posts > 0 && (
                                                    <div className="text-xs text-muted-foreground/70 italic px-2">
                                                        {thread.omitted_posts} posts omitted...
                                                    </div>
                                                )}
                                                <div className="border-l-2 border-primary/10 pl-3 space-y-2">
                                                    {thread.replies_preview.map((reply) => (
                                                        <div key={reply.model.id} className="bg-muted/10 rounded p-2 text-sm hover:bg-muted/20 transition-colors">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-[10px] font-bold text-muted-foreground">No. {reply.model.id}</span>
                                                                <span className="text-[10px] text-muted-foreground/60">{formatDistanceToNow(new Date(reply.model.created_at))} ago</span>
                                                            </div>
                                                            <p className="line-clamp-2 text-muted-foreground allow-select">{reply.model.content}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>

            {/* Sidebar (Desktop) */}
            <div className="hidden lg:block space-y-6">
                <div className="sticky top-24 space-y-6">
                    <div className="rounded-xl border bg-card p-6 shadow-sm">
                        <h1 className="text-2xl font-bold tracking-tight">/{data.board.slug}/</h1>
                        <h2 className="text-lg font-medium text-muted-foreground">{data.board.name}</h2>
                        <div className="my-4 h-px bg-border" />
                        <p className="text-sm text-muted-foreground leading-relaxed">{data.board.description}</p>
                    </div>

                    <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                            <Info className="h-4 w-4" /> Board Rules
                        </div>
                        <ul className="text-xs text-muted-foreground space-y-2 list-disc list-inside opacity-80">
                            <li>No spam or flood.</li>
                            <li>Do not post illegal content.</li>
                            <li>Respect anonymity.</li>
                            <li>Global rules apply.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}
