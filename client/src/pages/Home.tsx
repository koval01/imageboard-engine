import { useGetHomeQuery } from '@/store/apiSlice'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function Home() {
    const { data, isLoading, error } = useGetHomeQuery()

    if (isLoading) return <div>Loading...</div>
    if (error) return <div>Error loading home</div>
    if (!data) return null

    return (
        <div className="grid gap-6">
            <section>
                <h2 className="text-2xl font-bold mb-4">Boards</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data.boards.map(({ model, post_count }) => (
                        <Link key={model.slug} to={`/${model.slug}`}>
                            <Card className="hover:bg-muted/50 transition-colors">
                                <CardHeader>
                                    <CardTitle className="flex justify-between items-center">
                                        <span>/{model.slug}/ - {model.name}</span>
                                        <Badge variant="secondary">{post_count}</Badge>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-muted-foreground">{model.description}</p>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-bold mb-4">Recent Images</h2>
                <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                    {data.recent_images.map((img) => (
                        <div key={img.model.id} className="aspect-square overflow-hidden rounded-md bg-muted">
                            <img
                                src={`${data.cdn_url}/${img.model.thumbnail_url}`}
                                className="object-cover w-full h-full hover:scale-105 transition-transform"
                                alt={img.model.filename}
                            />
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
