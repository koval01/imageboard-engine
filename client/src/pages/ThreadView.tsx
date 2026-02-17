import { useParams } from 'react-router-dom'
import { useGetThreadQuery } from '@/store/apiSlice'

export default function ThreadView() {
    const { slug, id } = useParams<{ slug: string, id: string }>()
    const { data, isLoading } = useGetThreadQuery({ slug: slug || '', id: parseInt(id || '0') })

    if (isLoading) return <div>Loading thread...</div>
    if (!data) return <div>Thread not found</div>

    return (
        <div>
            <div className="mb-8 p-4 border rounded bg-card">
                <h2 className="text-xl font-bold">{data.thread.subject}</h2>
                <p className="whitespace-pre-wrap mt-2">{data.thread.content}</p>
            </div>

            <div className="space-y-4 ml-4 md:ml-8">
                {data.replies.map(post => (
                    <div key={post.model.id} className="p-3 bg-secondary/20 rounded border">
                        <div className="text-xs text-muted-foreground mb-1">
                            {post.model.id} - {post.model.created_at}
                        </div>
                        <p className="whitespace-pre-wrap">{post.model.content}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}
