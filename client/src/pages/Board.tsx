import { useParams, Link } from 'react-router-dom'
import { useGetBoardQuery } from '@/store/apiSlice'
import PostForm from '@/components/PostForm'
import Post from '@/components/Post'

export default function Board() {
    const { slug } = useParams<{ slug: string }>()
    const { data, isLoading, error } = useGetBoardQuery(slug || '', { skip: !slug })

    if (isLoading) return <div className="text-center mt-10">Loading Board...</div>
    if (error || !data) return <div className="text-center mt-10 text-red-500">Board not found</div>

    return (
        <div>
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-neutral-800 dark:text-neutral-100">
                    /{data.board.slug}/ - {data.board.name}
                </h1>
                <p className="text-neutral-500">{data.board.description}</p>
            </div>

            <PostForm slug={slug!} />

            <div className="space-y-8">
                {data.threads.map((thread) => (
                    <div key={thread.model.id} className="border-b border-neutral-200 dark:border-neutral-800 pb-6 mb-6">
                        {/* OP Post Rendering */}
                        <div className="mb-2">
                            <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                                {thread.model.subject && <span className="font-bold text-blue-700 dark:text-blue-400 mr-2">{thread.model.subject}</span>}
                                <span className="font-bold text-green-700 dark:text-green-500">Anonymous</span>
                                <span className="mx-2 text-neutral-300">|</span>
                                <time>{new Date(thread.model.created_at + 'Z').toLocaleString()}</time>
                                <span className="mx-2 text-neutral-300">|</span>
                                <Link to={`/${slug}/thread/${thread.model.id}`} className="hover:underline font-medium">No.{thread.model.id}</Link>
                                <span className="mx-2 text-neutral-300">|</span>
                                <Link to={`/${slug}/thread/${thread.model.id}`} className="text-blue-600 hover:underline">
                                    [Reply]
                                </Link>
                            </div>

                            <div className="post-content">
                                <Post
                                    post={{
                                        model: { ...thread.model, thread_id: 0 } as any, // Duck typing Op to Post
                                        images: thread.images,
                                        cdn_url: data.cdn_url,
                                        admin_role: data.admin_role,
                                        board_slug: slug!
                                    }}
                                    isOp={true}
                                    cdnUrl={data.cdn_url}
                                />
                            </div>
                        </div>

                        {/* Omitted info */}
                        {(thread.omitted_posts > 0 || thread.omitted_images > 0) && (
                            <div className="text-sm text-neutral-400 italic mb-2 ml-4">
                                {thread.omitted_posts} posts and {thread.omitted_images} images omitted.
                                <Link to={`/${slug}/thread/${thread.model.id}`} className="text-blue-500 hover:underline ml-1">Click to view.</Link>
                            </div>
                        )}

                        {/* Replies Preview */}
                        <div className="ml-4 md:ml-8 space-y-1">
                            {thread.replies_preview.map((reply) => (
                                <div key={reply.model.id} className="table">
                                    <div className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-sm">
                                        <Post post={reply} cdnUrl={data.cdn_url} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}