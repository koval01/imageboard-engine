import { useGetHomeQuery } from '@/store/apiSlice'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

export default function HomePage() {
    const { data, isLoading, error } = useGetHomeQuery()

    if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>
    if (error) return <div className="text-red-500 text-center">Failed to load home</div>

    return (
        <div className="space-y-8">
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter">Welcome</h1>
                <p className="text-muted-foreground">Select a board to start browsing</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {data?.boards.map((stat) => (
                    <Link
                        key={stat.model.slug}
                        to={`/${stat.model.slug}`}
                        className="block p-4 border rounded hover:bg-muted/50 transition-colors"
                    >
                        <div className="font-bold text-lg">/{stat.model.slug}/ - {stat.model.name}</div>
                        <div className="text-xs text-muted-foreground">{stat.post_count} posts</div>
                    </Link>
                ))}
            </div>

            {data?.recent_images && data.recent_images.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-xl font-bold border-b pb-2">Recent Images</h2>
                    <div className="flex flex-wrap gap-2">
                        {data.recent_images.map((img) => {
                            const board = data.boards.find(b => b.model.id === img.board_id);
                            const slug = board?.model.slug || 'b';
                            return (
                                <Link
                                    key={img.id}
                                    to={`/${slug}/thread/${img.thread_id}`}
                                    className="block border hover:border-primary"
                                >
                                    <img
                                        src={`${data.cdn_url}/${img.thumbnail_url}`}
                                        alt=""
                                        className="h-24 w-24 object-cover"
                                    />
                                </Link>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
