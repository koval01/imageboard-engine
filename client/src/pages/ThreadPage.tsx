import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    useGetThreadQuery,
    usePostReplyMutation,
    useBanUserMutation,
    useDeleteContentMutation,
    useReportPostMutation
} from "@/store/apiSlice";
import { Post } from "@/components/Post";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { PostItem } from "@/types"; // Fixed: type-only import
import { Loader2, Upload, Send } from "lucide-react";

export default function ThreadPage() {
    const { slug, id } = useParams();
    const threadId = parseInt(id || "0");
    const navigate = useNavigate();
    const bottomRef = useRef<HTMLDivElement>(null);

    // Polling configuration: refetch every 10 seconds to keep chat live
    const { data, isLoading, error, refetch } = useGetThreadQuery(
        { slug: slug!, id: threadId },
        { pollingInterval: 10000 }
    );

    const [postReply, { isLoading: isPosting }] = usePostReplyMutation();
    const [banUser] = useBanUserMutation();
    const [deleteContent] = useDeleteContentMutation();
    const [reportPost] = useReportPostMutation();

    const [replyContent, setReplyContent] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // State to track auto-scrolling behavior
    const [shouldScroll, setShouldScroll] = useState(true);
    const prevPostCount = useRef(0);

    // Auto-scroll logic
    useEffect(() => {
        if (!data) return;
        const currentCount = data.replies.length;

        // Initial load: Scroll to bottom (or hash) if needed
        if (prevPostCount.current === 0 && currentCount > 0) {
            if (shouldScroll && !window.location.hash) {
                // Small timeout ensures images/layout have stabilized slightly
                setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 100);
            }
        }
        // New posts added via polling or user action: Smooth scroll
        else if (currentCount > prevPostCount.current) {
            if (shouldScroll) {
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }
        }
        prevPostCount.current = currentCount;
    }, [data, shouldScroll]);

    const handleReply = async () => {
        if (!replyContent.trim() && !selectedFile) {
            toast.error("Reply cannot be empty");
            return;
        }

        const formData = new FormData();
        formData.append("content", replyContent);
        if (selectedFile) formData.append("file", selectedFile);

        try {
            setShouldScroll(true); // Force scroll to bottom for own post
            await postReply({ slug: slug!, id: threadId, formData }).unwrap();

            // Reset form
            setReplyContent("");
            setSelectedFile(null);
            refetch(); // Fetch immediately to show the new post without waiting for poll
            toast.success("Reply posted");
        } catch (err: any) {
            toast.error(err?.data?.error || "Failed to post reply");
        }
    };

    const quotePost = (postId: number) => {
        setReplyContent((prev) => {
            // Add newline if text exists and doesn't end with one
            const prefix = prev.length > 0 && !prev.endsWith('\n') ? '\n' : '';
            return `${prev}${prefix}>>${postId}\n`;
        });
    };

    const handleBan = async (ip: string, session: string) => {
        if (window.confirm(`Are you sure you want to ban ${ip}?`)) {
            try {
                await banUser({
                    ip,
                    session,
                    reason: "Manual ban from thread view",
                    duration: 24,
                    delete_content: true
                }).unwrap();
                toast.success("User banned and content deleted");
                refetch();
            } catch (e) {
                toast.error("Failed to ban user");
            }
        }
    };

    const handleDelete = async (itemId: number, type: 'post' | 'thread') => {
        if(window.confirm(`Delete this ${type}?`)) {
            try {
                await deleteContent({ id: itemId, type_: type }).unwrap();
                toast.success(`${type} deleted`);
                if (type === 'thread') {
                    navigate(`/${slug}`);
                } else {
                    refetch();
                }
            } catch (e) {
                toast.error("Failed to delete");
            }
        }
    };

    const handleInvestigate = (target: string) => {
        window.open(`/admin?target=${target}`, '_blank');
    };

    if (isLoading) return (
        <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    if (error || !data) return (
        <div className="container py-10 text-center">
            <h2 className="text-xl font-semibold">Thread not found or deleted</h2>
            <Button variant="link" onClick={() => navigate(`/${slug}`)}>Return to Board</Button>
        </div>
    );

    // Construct OP object matching PostItem interface
    const opPost: PostItem = {
        model: {
            ...data.thread,
            thread_id: data.thread.id,
            id: data.thread.id
        } as any,
        images: data.op_images,
        cdn_url: data.cdn_url,
        admin_role: data.admin_role,
        board_slug: data.board.slug,
        thread_id: data.thread.id // Fixed: Included required thread_id
    };

    return (
        <div className="relative min-h-screen">
            {/* Main Content Container - pb-48 ensures content isn't hidden behind the fixed footer */}
            <div className="container max-w-4xl mx-auto py-6 pb-48">
                <Button variant="ghost" className="mb-4 pl-0 hover:bg-transparent hover:underline" onClick={() => navigate(`/${slug}`)}>
                    &larr; Back to /{data.board.slug}/
                </Button>

                {/* OP Post */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-primary mb-2 break-words">
                        {data.thread.subject || "No Subject"}
                    </h1>
                    <Post
                        post={opPost}
                        isOp
                        onReply={quotePost}
                        onReport={(id) => reportPost({ post_id: id, reason: "User report" })}
                        onBan={handleBan}
                        onDelete={(id) => handleDelete(id, 'thread')}
                        onInvestigate={handleInvestigate}
                    />
                </div>

                <Separator className="my-6" />

                {/* Replies List */}
                <div className="space-y-1">
                    {data.replies.map((post) => (
                        <Post
                            key={post.model.id}
                            post={post}
                            onReply={quotePost}
                            onReport={(id) => reportPost({ post_id: id, reason: "User report" })}
                            onBan={handleBan}
                            onDelete={(id) => handleDelete(id, 'post')}
                            onInvestigate={handleInvestigate}
                        />
                    ))}
                </div>

                {/* Invisible element to scroll to */}
                <div ref={bottomRef} className="h-4" />
            </div>

            {/* Sticky Reply Bar - The "following" input field */}
            <div className="fixed bottom-0 left-0 w-full z-50 bg-background/80 backdrop-blur-md border-t border-border shadow-2xl p-4">
                <div className="container max-w-4xl mx-auto flex gap-3 items-end">
                    <div className="flex-1">
                        <Textarea
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder="Write a reply..."
                            className="min-h-[88px] max-h-[200px] resize-none focus-visible:ring-primary"
                        />
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                        {/* File Upload Button */}
                        <div className="relative">
                            <input
                                type="file"
                                id="file-upload"
                                className="hidden"
                                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                            />
                            <Button
                                variant={selectedFile ? "secondary" : "outline"}
                                size="icon"
                                className={selectedFile ? "text-primary border-primary" : ""}
                                onClick={() => document.getElementById('file-upload')?.click()}
                                title="Attach Image"
                            >
                                <Upload className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Send Button */}
                        <Button onClick={handleReply} disabled={isPosting} size="icon">
                            {isPosting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>

                {/* Selected File Indicator */}
                {selectedFile && (
                    <div className="container max-w-4xl mx-auto text-xs text-muted-foreground mt-2 flex items-center justify-between">
                        <span>Attached: {selectedFile.name}</span>
                        <span className="cursor-pointer hover:text-destructive" onClick={() => setSelectedFile(null)}>Remove</span>
                    </div>
                )}
            </div>
        </div>
    );
}
