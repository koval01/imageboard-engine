import { useParams, Link } from 'react-router-dom'
import { useGetThreadQuery } from '@/store/apiSlice'
import PostForm from '@/components/PostForm'
import Post from '@/components/Post'

export default function Thread() {
    const { slug, id } = useParams<{ slug: string, id: string }>()
    const threadId = parseInt(id || '0')

    const { data, isLoading, error } = useGetThreadQuery(
        { slug: slug || '', id: threadId },
        {
            skip: !slug || !threadId,
            pollingInterval: 15000 // Auto-refresh every 15s
        }
    )

    if (isLoading) return <div className="text-center mt-10">Loading Thread...</div>
    if (error || !data) return <div className="text-center mt-10 text-red-500">Thread not found</div>

    return (
        <div className="pb-20">
            <div className="mb-4">
                <Link to={`/${slug}`} className="text-blue-600 hover:underline">&larr; Back to /{slug}/</Link>
            </div>

            {/* OP Post */}
            <div className="mb-6">
                <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
                    {data.thread.subject && <span className="font-bold text-blue-700 dark:text-blue-400 text-lg mr-2">{data.thread.subject}</span>}
                    <span className="font-bold text-green-700 dark:text-green-500">Anonymous</span>
                    {data.thread.country_code && (
                        <span className="ml-2 text-xs border border-neutral-300 px-1 rounded uppercase">
              {data.thread.country_code}
            </span>
                    )}
                    <span className="mx-2 text-neutral-300">|</span>
                    <time>{new Date(data.thread.created_at + 'Z').toLocaleString()}</time>
                    <span className="mx-2 text-neutral-300">|</span>
                    <span className="font-medium">No.{data.thread.id}</span>
                    <span className="mx-2 text-neutral-300">|</span>
                    {data.is_bump_limit && <span className="text-red-500 text-xs italic mr-2">Bump Limit Reached</span>}
                    {data.is_time_limit && <span className="text-red-500 text-xs italic">Time Limit Reached</span>}
                </div>

                <Post
                    post={{
                        model: { ...data.thread, thread_id: 0 } as any,
                        images: data.op_images,
                        cdn_url: data.cdn_url,
                        admin_role: data.admin_role,
                        board_slug: slug!
                    }}
                    isOp={true}
                    cdnUrl={data.cdn_url}
                />
            </div>

            {/* Replies */}
            <div className="space-y-1 mb-8">
                {data.replies.map((reply) => (
                    <div key={reply.model.id} className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-sm table max-w-full">
                        <Post post={reply} cdnUrl={data.cdn_url} />
                    </div>
                ))}
            </div>

            <hr className="my-8 border-neutral-300 dark:border-neutral-700"/>

            <PostForm slug={slug!} threadId={threadId} />
        </div>
    )
}
