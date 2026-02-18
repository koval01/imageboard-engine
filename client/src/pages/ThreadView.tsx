import { useParams } from 'react-router-dom';
import { useGetThreadQuery } from '@/store/apiSlice';
import { Post } from '@/components/board/Post';
import PostForm from '@/components/board/PostForm';
import { Loader2 } from 'lucide-react';

export default function ThreadView() {
    const { slug, id } = useParams<{ slug: string; id: string }>();
    const threadId = parseInt(id || '0');

    const { data, isLoading, error } = useGetThreadQuery({
        slug: slug || '',
        id: threadId
    }, {
        pollingInterval: 30000 // Auto-refresh every 30s
    });

    const handleQuote = (postId: number) => {
        // Logic to insert `>>{postId}` into the reply form
        const textarea = document.getElementById('reply-textarea') as HTMLTextAreaElement;
        if (textarea) {
            textarea.value += `>>${postId}\n`;
            textarea.focus();
        }
    };

    if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;
    if (error || !data) return <div className="p-10 text-center text-destructive">Thread not found</div>;

    const opPostItem = {
        model: { ...data.thread, thread_id: data.thread.id }, // Adapt thread to post interface
        images: data.op_images,
        cdn_url: data.cdn_url,
        admin_role: data.admin_role,
        board_slug: data.board.slug
    };

    return (
        <div className="container mx-auto p-4 max-w-5xl">
            <div className="mb-6 border-b pb-4">
                <h1 className="text-2xl font-bold text-primary">{data.thread.subject || 'No Subject'}</h1>
                <p className="text-muted-foreground">/{data.board.slug}/ - {data.board.name}</p>
            </div>

            {/* OP Post */}
            <Post post={opPostItem as any} isOp={true} onReply={handleQuote} />

            {/* Replies */}
            <div className="space-y-1 mt-4">
                {data.replies.map(post => (
                    <Post key={post.model.id} post={post} onReply={handleQuote} />
                ))}
            </div>

            <div className="mt-8 border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Post a Reply</h3>
                <PostForm boardSlug={slug!} threadId={threadId} />
            </div>
        </div>
    );
}
