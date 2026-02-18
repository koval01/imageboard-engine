import { useGetHomeQuery } from '@/store/apiSlice'
import { Link } from 'react-router-dom'
import { Loader2, MessageSquare } from 'lucide-react'

export default function HomePage() {
    const { data, isLoading, error } = useGetHomeQuery()

    if (isLoading) return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-muted-foreground" /></div>
    if (error) return <div className="p-8 text-center text-destructive">Failed to load boards.</div>
    if (!data) return null

    return (
        <div className="space-y-8">
            {/* Hero / Recent Images */}
            <section>
                <h2 className="mb-4 text-2xl font-bold tracking-tight">Recent Activity</h2>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
                    {data.recent_images.map((img) => (
                        <Link
                            key={img.id}
                            to={`/b/thread/${img.thread_id}`} // Note: Need to know board slug here. API update might be needed, or assume 'b' is placeholder.
                            // Correction: The backend API home response sends recent_images but currently RecentImageDto doesn't have board_slug.
                            // For now, let's just show the image or link to a generic route if possible, or skip linking if data missing.
                            className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                        >
                            <img
                                src={`${data.cdn_url}/${img.thumbnail_url}`}
                                alt=""
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                                loading="lazy"
                            />
                        </Link>
                    ))}
                </div>
            </section>

            {/* Boards List */}
            <section>
                <h2 className="mb-4 text-2xl font-bold tracking-tight">Boards</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {data.boards.map(({ model: board, post_count }) => (
                        <Link key={board.slug} to={`/${board.slug}`} className="block h-full">
                            <div className="flex h-full flex-col justify-between rounded-lg border bg-card p-6 transition-all hover:border-primary hover:shadow-md">
                                <div>
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl font-bold">/{board.slug}/ - {board.name}</h3>
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">{board.description}</p>
                                </div>
                                <div className="mt-4 flex items-center text-xs text-muted-foreground">
                                    <MessageSquare className="mr-1 h-3 w-3" />
                                    {post_count.toLocaleString()} posts
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    )
}
