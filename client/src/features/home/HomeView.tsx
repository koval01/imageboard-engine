import { useGetHomeQuery } from '@/store/apiSlice'
import { Helmet } from 'react-helmet-async'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Link } from 'react-router-dom'

export default function HomeView() {
    const { data, isLoading } = useGetHomeQuery()

    if (isLoading) return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>

    return (
        <div className="space-y-8">
            <Helmet>
                <title>Kryivka - Home</title>
            </Helmet>

            <section>
                <h2 className="text-2xl font-bold tracking-tight mb-4">Boards</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data?.boards.map((stat) => (
                        <Link key={stat.model.slug} to={`/${stat.model.slug}`}>
                            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <CardTitle>/{stat.model.slug}/ - {stat.model.name}</CardTitle>
                                        <Badge variant="secondary">{stat.post_count} posts</Badge>
                                    </div>
                                    <CardDescription>{stat.model.description}</CardDescription>
                                </CardHeader>
                            </Card>
                        </Link>
                    ))}
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-bold tracking-tight mb-4">Recent Images</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {data?.recent_images.map((img) => (
                        <Link key={img.id} to={`/thread/${img.thread_id}`} className="block aspect-square overflow-hidden rounded-md border bg-muted">
                            <img
                                src={img.thumbnail_url.startsWith('http') ? img.thumbnail_url : `${data.cdn_url}/${img.thumbnail_url}`}
                                alt={img.filename}
                                className="h-full w-full object-cover transition-all hover:scale-105"
                                loading="lazy"
                            />
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    )
}