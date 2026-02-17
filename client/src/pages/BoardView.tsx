import { useParams, Link } from 'react-router-dom'
import { useGetBoardQuery } from '@/store/apiSlice'
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function BoardView() {
    const { slug } = useParams<{ slug: string }>()
    const { data, isLoading } = useGetBoardQuery(slug || '')

    if (isLoading) return <div>Loading board...</div>
    if (!data) return <div>Board not found</div>

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6 text-center">/{data.board.slug}/ - {data.board.name}</h1>
            <div className="space-y-6">
                {data.threads.map(thread => (
                    <Card key={thread.model.id}>
                        <CardHeader>
                            <Link to={`/${data.board.slug}/thread/${thread.model.id}`} className="text-blue-600 hover:underline font-bold">
                                {thread.model.subject || 'No Subject'} (No. {thread.model.id})
                            </Link>
                        </CardHeader>
                        <CardContent>
                            <p className="whitespace-pre-wrap">{thread.model.content}</p>
                            <div className="mt-4 text-sm text-muted-foreground">
                                {thread.reply_count} replies, {thread.image_count} images
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
