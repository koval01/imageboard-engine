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
import type { PostItem } from "@/types";
import { Loader2, Upload } from "lucide-react";

export default function ThreadPage() {
    const { slug, id } = useParams();
    const threadId = parseInt(id || "0");
    const navigate = useNavigate();
    const bottomRef = useRef<HTMLDivElement>(null);

    // Polling configuration: refetch every 10 seconds
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
    const [shouldScroll, setShouldScroll] = useState(true);
    const prevPostCount = useRef(0);

    // Auto-scroll logic
    useEffect(() => {
        if (!data) return;
        const currentCount = data.replies.length;

        // Initial load scroll
        if (prevPostCount.current === 0 && currentCount > 0) {
            if (shouldScroll && !window.location.hash) {
                setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 100);
            }
        }
        // New posts added
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
            setShouldScroll(true); // Ensure we scroll to the new post
            await postReply({ slug: slug!, id: threadId, formData }).unwrap();

            // Cleanup
            setReplyContent("");
            setSelectedFile(null);
            refetch(); // Fetch immediately to show the new post
            toast.success("Reply posted");
        } catch (err: any) {
            toast.error(err?.data?.error || "Failed to post reply");
        }
    };

    const quotePost = (postId: number) => {
        setReplyContent((prev) => {
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
        thread_id: data.thread.id // Added missing property
    };

    return (
        <div className="container max-w-4xl mx-auto py-6 pb-40">
            <Button variant="ghost" className="mb-4 pl-0" onClick={() => navigate(`/${slug}`)}>
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

            {/* Replies */}
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

            <div ref={bottomRef} className="h-4" />

            {/* Sticky Reply Box */}
            <div className="fixed bottom-0 left-0 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t p-4 shadow-lg z-40">
                <div className="container max-w-4xl mx-auto flex gap-3 items-end">
                    <div className="flex-1 space-y-2">
                        <Textarea
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder="Write a reply..."
                            className="min-h-[80px] resize-none"
                        />
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                        <div className="relative">
                            <input
                                type="file"
                                id="file-upload"
                                className="hidden"
                                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                            />
                            <Button
                                variant="outline"
                                size="icon"
                                className={selectedFile ? "border-primary text-primary" : ""}
                                onClick={() => document.getElementById('file-upload')?.click()}
                            >
                                <Upload className="h-4 w-4" />
                            </Button>
                        </div>

                        <Button onClick={handleReply} disabled={isPosting}>
                            {isPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reply"}
                        </Button>
                    </div>
                </div>
                {selectedFile && (
                    <div className="container max-w-4xl mx-auto text-xs text-muted-foreground mt-1">
                        Attached: {selectedFile.name}
                    </div>
                )}
            </div>
        </div>
    );
}
