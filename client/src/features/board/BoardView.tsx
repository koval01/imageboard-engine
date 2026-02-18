import { useParams, Link } from 'react-router-dom'
import { useGetBoardQuery } from '@/store/apiSlice'
import { Helmet } from 'react-helmet-async'
import { PostCard } from '@/components/PostCard'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import PostForm from '@/components/PostForm'

export default function BoardView() {
    const { slug } = useParams<{ slug: string }>()
    const { data, isLoading, error } = useGetBoardQuery(slug || '', { skip: !slug })

    if (isLoading) return <div className="space-y-4"><Skeleton className="h-64 w-full" /></div>
    if (error || !data) return <div className="text-center text-destructive">Board not found</div>

    return (
        <div className="space-y-6">
            <Helmet>
                <title>/{data.board.slug}/ - {data.board.name}</title>
            </Helmet>

            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold text-primary">/{data.board.slug}/ - {data.board.name}</h1>
                <p className="text-muted-foreground">{data.board.description}</p>
            </div>

            <div className="flex justify-center my-6">
                <PostForm boardSlug={slug!} type="thread" />
            </div>

            <Separator />

            <div className="space-y-8">
                {data.threads.map((thread) => (
                    <div key={thread.model.id} className="relative">
                        <PostCard post={thread} isOp cdnUrl={data.cdn_url} />

                        {thread.omitted_posts > 0 && (
                            <div className="text-sm text-muted-foreground ml-4 mb-2">
                                {thread.omitted_posts} posts and {thread.omitted_images} images omitted.
                                <Link to={`/${slug}/thread/${thread.model.id}`} className="text-primary hover:underline ml-1">
                                    Click to view.
                                </Link>
                            </div>
                        )}

                        <div className="ml-4 md:ml-8 space-y-2">
                            {thread.replies_preview.map((reply) => (
                                <PostCard key={reply.model.id} post={reply} cdnUrl={data.cdn_url} />
                            ))}
                        </div>

                        <div className="mt-2 ml-4">
                            <Link to={`/${slug}/thread/${thread.model.id}`}>
                                <Button variant="secondary" size="sm">Open Thread</Button>
                            </Link>
                        </div>
                        <Separator className="mt-8" />
                    </div>
                ))}
            </div>
        </div>
    )
}
