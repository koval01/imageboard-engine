import { useParams } from 'react-router-dom'
import { useGetThreadQuery } from '@/store/apiSlice'
import { Helmet } from 'react-helmet-async'
import { PostCard } from '@/components/PostCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import PostForm from '@/components/PostForm'
import { useRef } from 'react'

export default function ThreadView() {
    const { slug, id } = useParams<{ slug: string; id: string }>()
    const { data, isLoading, error } = useGetThreadQuery({
        slug: slug || '',
        id: parseInt(id || '0')
    }, { skip: !slug || !id })

    // Ref to pass quote/reply ID to form
    const formRef = useRef<{ setContent: (val: string) => void }>(null)

    const handleReply = (postId: number) => {
        if (formRef.current) {
            formRef.current.setContent(`>>${postId}\n`)
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
        }
    }

    if (isLoading) return <div className="space-y-4"><Skeleton className="h-64 w-full" /></div>
    if (error || !data) return <div className="text-center text-destructive">Thread not found</div>

    const pageTitle = data.thread.subject || data.thread.content.slice(0, 30) || `Thread ${data.thread.id}`

    return (
        <div className="max-w-4xl mx-auto pb-20">
            <Helmet>
                <title>/{data.board.slug}/ - {pageTitle}</title>
            </Helmet>

            {/* Reconstruct OP structure for PostCard */}
            <PostCard
                post={{ model: data.thread, images: data.op_images }}
                isOp
                cdnUrl={data.cdn_url}
                onReply={handleReply}
            />

            <div className="space-y-2 mt-4">
                {data.replies.map((reply) => (
                    <PostCard
                        key={reply.model.id}
                        post={reply}
                        cdnUrl={data.cdn_url}
                        onReply={handleReply}
                    />
                ))}
            </div>

            <Separator className="my-8" />

            <div className="max-w-xl mx-auto">
                <h3 className="text-lg font-semibold mb-4 text-center">Reply to Thread</h3>
                <PostForm
                    ref={formRef}
                    boardSlug={slug!}
                    threadId={data.thread.id}
                    type="reply"
                />
            </div>
        </div>
    )
}