import { useParams, Link } from 'react-router-dom'
import { useGetThreadQuery, usePostReplyMutation } from '@/store/apiSlice'
import { Post } from '@/components/Post'
import PostForm from '@/components/PostForm'
import { Loader2, ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'

export default function ThreadPage() {
    const { slug, id } = useParams<{ slug: string; id: string }>()
    const threadId = parseInt(id || '0')

    const { data, isLoading, isFetching } = useGetThreadQuery(
        { slug: slug || '', id: threadId },
        { skip: !slug || !threadId, pollingInterval: 15000 } // Poll every 15s
    )

    const [postReply, { isLoading: isPosting }] = usePostReplyMutation()

    // Scroll to bottom or specific post if hash exists could be handled here
    useEffect(() => {
        if (window.location.hash) {
            const id = window.location.hash.replace('#', '');
            const element = document.getElementById(id);
            if (element) element.scrollIntoView();
        }
    }, [data])

    if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>
    if (!data) return <div className="text-center p-10">Thread not found</div>

    const handleReply = async (formData: FormData) => {
        if (!slug) return
        try {
            await postReply({ slug, id: threadId, formData }).unwrap()
            // Auto-refresh via tags
        } catch (err) {
            console.error("Reply failed", err)
            alert("Failed to reply")
        }
    }

    // Construct OP Post Item
    const opPost = {
        model: {
            id: data.thread.id,
            thread_id: data.thread.id,
            content: data.thread.content,
            session_id: data.thread.session_id,
            ip_address: data.thread.ip_address,
            country_code: data.thread.country_code,
            created_at: data.thread.created_at,
        },
        images: data.op_images,
        cdn_url: data.cdn_url,
        admin_role: data.admin_role,
        board_slug: data.board.slug
    }

    return (
        <div className="pb-20">
            <div className="flex items-center gap-4 border-b pb-4 mb-4">
                <Link to={`/${slug}`} className="flex items-center gap-1 text-sm font-bold hover:underline">
                    <ArrowLeft className="h-4 w-4" /> Back
                </Link>
                <h1 className="text-xl font-bold text-primary">/{data.board.slug}/ - {data.thread.subject || 'Thread ' + data.thread.id}</h1>
            </div>

            {/* OP */}
            <div className="mb-4">
                <Post post={opPost} isOp={true} />
            </div>

            {/* Replies */}
            <div className="space-y-1 mb-10 ml-0 md:ml-4">
                {data.replies.map((reply) => (
                    <div key={reply.model.id} className="table my-1">
                        <Post post={{...reply, cdn_url: data.cdn_url}} />
                    </div>
                ))}
            </div>

            {/* Reply Form Sticky Bottom or Static */}
            <div className="border-t pt-8 mt-8">
                <h3 className="text-center text-sm font-bold mb-4">Post a Reply</h3>
                <PostForm onSubmit={handleReply} loading={isPosting} buttonLabel="Reply" />
            </div>

            {isFetching && <div className="fixed top-4 right-4 text-xs bg-primary text-primary-foreground px-2 py-1 rounded shadow">Syncing...</div>}
        </div>
    )
}
