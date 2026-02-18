import { useGetHomeQuery } from "@/store/apiSlice"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Link } from "react-router-dom"

export default function HomePage() {
    const { data, isLoading, error } = useGetHomeQuery()

    if (isLoading) return <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>
    if (error || !data) return <div className="text-destructive">Failed to load home data.</div>

    return (
        <div className="space-y-8">
            {/* Boards Section */}
            <section>
                <h2 className="text-2xl font-bold tracking-tight mb-4">Boards</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {data.boards.map((stat) => (
                        <Link key={stat.model.id} to={`/${stat.model.slug}`}>
                            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-xl">/{stat.model.slug}/</CardTitle>
                                        <Badge variant="secondary">{stat.post_count} posts</Badge>
                                    </div>
                                    <CardDescription>{stat.model.name}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                        {stat.model.description}
                                    </p>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Recent Images Section */}
            <section>
                <h2 className="text-2xl font-bold tracking-tight mb-4">Recent Images</h2>
                <div className="flex flex-wrap gap-2">
                    {data.recent_images.map((img) => (
                        <div key={img.id} className="relative group">
                            <Link to={`/thread/${img.thread_id}`}> {/* Note: Logic might need board slug, assuming ID linking works or redirect */}
                                <img
                                    src={`${data.cdn_url}/thumb/${img.thumbnail_url}`}
                                    className="h-32 w-32 object-cover rounded-md border"
                                    alt={img.filename}
                                />
                            </Link>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
