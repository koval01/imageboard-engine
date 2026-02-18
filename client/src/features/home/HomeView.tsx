import { Link } from 'react-router-dom'
import { useGetHomeQuery } from '@/store/apiSlice'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function HomeView() {
    const { data, isLoading, error } = useGetHomeQuery()

    if (isLoading) return <div className="container mx-auto p-4">Loading...</div>
    if (error || !data) return <div className="container mx-auto p-4 text-red-500">Error loading data</div>

    return (
        <div className="container mx-auto p-4 space-y-8">
            <section>
                <h2 className="text-2xl font-bold mb-4">Boards</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {data.boards.map((b) => (
                        <Link key={b.model.slug} to={`/${b.model.slug}`}>
                            <Card className="hover:bg-accent transition-colors h-full">
                                <CardHeader>
                                    <CardTitle>/{b.model.slug}/ - {b.model.name}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">{b.model.description}</p>
                                    <p className="text-xs mt-2 text-muted-foreground">{b.post_count} posts</p>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-bold mb-4">Recent Threads</h2>
                <div className="space-y-2">
                    {data.recent_threads.map(thread => (
                        <div key={thread.id} className="p-2 border rounded hover:bg-accent">
                            <Link to={`/${thread.board_slug}/thread/${thread.id}`}>
                                <span className="font-bold">/{thread.board_slug}/</span>
                                <span className="ml-2">{thread.subject || thread.content.substring(0, 50)}...</span>
                            </Link>
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-bold mb-4">Recent Images</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {data.recent_images.map(img => (
                        <div key={img.id} className="aspect-square relative overflow-hidden rounded border">
                            <a href={data.cdn_url + img.url} target="_blank" rel="noreferrer">
                                <img
                                    src={data.cdn_url + "/" + img.thumbnail_url}
                                    alt={img.filename}
                                    className="object-cover w-full h-full hover:scale-105 transition-transform"
                                    loading="lazy"
                                />
                            </a>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
