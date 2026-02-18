import { useParams, Link } from 'react-router-dom'
import { useGetBoardQuery, useCreateThreadMutation } from '@/store/apiSlice'
import { Post } from '@/components/Post'
import PostForm from '@/components/PostForm'
import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'

export default function BoardPage() {
    const { slug } = useParams<{ slug: string }>()
    const { data, isLoading, isFetching } = useGetBoardQuery(slug || '')
    const [createThread, { isLoading: isCreating }] = useCreateThreadMutation()
    const [showForm, setShowForm] = useState(false)

    if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>
    if (!data) return <div className="text-center p-10">Board not found</div>

    const handleCreate = async (formData: FormData) => {
        if (!slug) return
        try {
            await createThread({ slug, formData }).unwrap()
            setShowForm(false)
            // RTK Query tags will auto-refresh the list
        } catch (err) {
            console.error("Failed to create thread", err)
            alert("Failed to create thread")
        }
    }

    return (
        <div className="space-y-6">
            <div className="text-center border-b pb-4">
                <h1 className="text-3xl font-bold text-primary">/{data.board.slug}/ - {data.board.name}</h1>
                <p className="text-sm text-muted-foreground mt-1">{data.board.description}</p>
            </div>

            <div className="flex justify-center">
                {showForm ? (
                    <PostForm
                        onSubmit={handleCreate}
                        onCancel={() => setShowForm(false)}
                        buttonLabel="Start Thread"
                        loading={isCreating}
                    />
                ) : (
                    <button
                        onClick={() => setShowForm(true)}
                        className="text-sm font-bold flex items-center gap-1 hover:underline"
                    >
                        <Plus className="h-4 w-4" /> Start a New Thread
                    </button>
                )}
            </div>

            <div className="space-y-8">
                {isFetching && !isLoading && <div className="text-center text-xs opacity-50">Updating...</div>}

                {data.threads.map((threadItem) => {
                    // Construct the OP Post Item from the thread model and images
                    // Note: ThreadItem structure in types.ts is slightly different from PostItem
                    // We need to adapt it for the <Post> component or create a specific view

                    // Constructing a pseudo-PostItem for the OP
                    const opPost = {
                        model: {
                            id: threadItem.model.id,
                            thread_id: threadItem.model.id,
                            content: threadItem.model.content,
                            session_id: threadItem.model.session_id,
                            ip_address: threadItem.model.ip_address,
                            country_code: threadItem.model.country_code,
                            created_at: threadItem.model.created_at,
                        },
                        images: threadItem.images,
                        cdn_url: data.cdn_url,
                        admin_role: 0, // Default
                        board_slug: data.board.slug
                    }

                    return (
                        <div key={threadItem.model.id} className="border-b pb-6">
                            {/* OP Post */}
                            <Post post={opPost} isOp={true} />

                            {/* Replies Preview */}
                            <div className="ml-4 md:ml-8 mt-2 space-y-1">
                                {threadItem.omitted_posts > 0 && (
                                    <div className="text-xs text-muted-foreground mb-2">
                                        {threadItem.omitted_posts} posts and {threadItem.omitted_images} images omitted.
                                        <Link to={`/${slug}/thread/${threadItem.model.id}`} className="ml-1 text-blue-600 hover:underline">Click to view.</Link>
                                    </div>
                                )}

                                {threadItem.replies_preview.map((reply) => (
                                    <div key={reply.model.id} className="table">
                                        <Post post={{...reply, cdn_url: data.cdn_url}} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
