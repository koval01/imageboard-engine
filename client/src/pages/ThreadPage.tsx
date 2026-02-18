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
import { Loader2, Upload, Send, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ThreadView() {
    const { slug, id } = useParams();
    const threadId = parseInt(id || "0");
    const navigate = useNavigate();

    // Polling configuration: refetch every 5 seconds for snappier updates
    const { data, isLoading, refetch } = useGetThreadQuery(
        { slug: slug!, id: threadId },
        { pollingInterval: 5000 }
    );

    const [postReply, { isLoading: isPosting }] = usePostReplyMutation();
    const [banUser] = useBanUserMutation();
    const [deleteContent] = useDeleteContentMutation();
    const [reportPost] = useReportPostMutation();

    const [replyContent, setReplyContent] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // --- Smart Scroll Logic State ---
    const [unreadCount, setUnreadCount] = useState(0);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [userJustReplied, setUserJustReplied] = useState(false);
    const prevPostCount = useRef(0);

    // 1. Track Scroll Position
    useEffect(() => {
        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
            // Consider "at bottom" if within 150px of the end
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            const atBottom = distanceFromBottom < 150;

            setIsAtBottom(atBottom);

            // If user manually scrolls to bottom, clear notifications
            if (atBottom) {
                setUnreadCount(0);
            }
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // 2. Handle New Data Arrival
    useEffect(() => {
        if (!data) return;
        const currentCount = data.replies.length;

        // Initial Load
        if (prevPostCount.current === 0 && currentCount > 0) {
            // Scroll to bottom on initial load unless there's a hash anchor
            if (!window.location.hash) {
                setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }), 50);
            }
        }
        // New Posts Arrived
        else if (currentCount > prevPostCount.current) {
            const newPosts = currentCount - prevPostCount.current;

            if (isAtBottom || userJustReplied) {
                // If user is already at bottom OR just sent a post -> Smooth Scroll Down
                setTimeout(() => {
                    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                    setUserJustReplied(false);
                }, 100);
                setUnreadCount(0);
            } else {
                // If user is reading history -> Show Notification
                setUnreadCount(prev => prev + newPosts);
            }
        }

        prevPostCount.current = currentCount;
    }, [data, isAtBottom, userJustReplied]);

    const scrollToBottom = () => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        setUnreadCount(0);
    };

    const handleReply = async () => {
        if (!replyContent.trim() && !selectedFile) {
            toast.error("Reply cannot be empty");
            return;
        }

        const formData = new FormData();
        formData.append("content", replyContent);
        if (selectedFile) formData.append("file", selectedFile);

        try {
            setUserJustReplied(true); // Flag to force scroll after mutation
            await postReply({ slug: slug!, id: threadId, formData }).unwrap();

            setReplyContent("");
            setSelectedFile(null);
            refetch();
            toast.success("Reply posted");
        } catch (err: any) {
            toast.error(err?.data?.error || "Failed to post reply");
            setUserJustReplied(false);
        }
    };

    const quotePost = (postId: number) => {
        setReplyContent((prev) => {
            const prefix = prev.length > 0 && !prev.endsWith('\n') ? '\n' : '';
            return `${prev}${prefix}>>${postId}\n`;
        });
        // Optional: Focus logic could trigger scrolling to input
    };

    // --- Admin Actions ---
    const handleBan = async (ip: string, session: string) => {
        if (window.confirm(`Are you sure you want to ban ${ip}?`)) {
            try {
                await banUser({
                    ip, session, reason: "Manual ban", duration: 24, delete_content: true
                }).unwrap();
                toast.success("User banned");
                refetch();
            } catch (e) { toast.error("Failed"); }
        }
    };

    const handleDelete = async (itemId: number, type: 'post' | 'thread') => {
        if(window.confirm(`Delete this ${type}?`)) {
            try {
                await deleteContent({ id: itemId, type_: type }).unwrap();
                toast.success("Deleted");
                if (type === 'thread') navigate(`/${slug}`);
                else refetch();
            } catch (e) { toast.error("Failed"); }
        }
    };

    if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (!data) return <div className="container py-10">Thread not found</div>;

    const opPost: PostItem = {
        model: { ...data.thread, thread_id: data.thread.id, id: data.thread.id } as any,
        images: data.op_images,
        cdn_url: data.cdn_url,
        admin_role: data.admin_role,
        board_slug: data.board.slug,
        thread_id: data.thread.id
    };

    return (
        <div className="min-h-screen flex flex-col bg-background">
            {/* Thread Content */}
            <div className="container max-w-4xl mx-auto py-6 flex-1">
                <Button variant="ghost" className="mb-4 pl-0" onClick={() => navigate(`/${slug}`)}>
                    &larr; Back to /{data.board.slug}/
                </Button>

                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-primary mb-2 break-words">
                        {data.thread.subject || "No Subject"}
                    </h1>
                    <Post
                        post={opPost} isOp onReply={quotePost}
                        onReport={(id) => reportPost({ post_id: id, reason: "Report" })}
                        onBan={handleBan} onDelete={(id) => handleDelete(id, 'thread')}
                        onInvestigate={(t) => window.open(`/admin?target=${t}`, '_blank')}
                    />
                </div>

                <Separator className="my-6" />

                <div className="space-y-1">
                    {data.replies.map((post) => (
                        <Post
                            key={post.model.id} post={post} onReply={quotePost}
                            onReport={(id) => reportPost({ post_id: id, reason: "Report" })}
                            onBan={handleBan} onDelete={(id) => handleDelete(id, 'post')}
                            onInvestigate={(t) => window.open(`/admin?target=${t}`, '_blank')}
                        />
                    ))}
                </div>
            </div>

            {/*
        Sticky Input Container
        position: sticky; bottom: 0; ensures it scrolls WITH the page
        but sticks to the bottom of the viewport when content is long.
      */}
            <div className="sticky bottom-0 z-40 w-full">

                {/* Twitter-style New Posts Notification */}
                {unreadCount > 0 && (
                    <div className="absolute -top-12 left-0 w-full flex justify-center pointer-events-none">
                        <Button
                            onClick={scrollToBottom}
                            className="pointer-events-auto rounded-full shadow-xl bg-primary text-primary-foreground animate-in fade-in slide-in-from-bottom-2"
                        >
                            <ArrowDown className="mr-2 h-4 w-4" />
                            {unreadCount} New Post{unreadCount > 1 ? 's' : ''}
                        </Button>
                    </div>
                )}

                {/* Input Bar */}
                <div className="max-w-[700px] p-1 pb-4 m-auto">
                    <div className="container max-w-4xl mx-auto flex gap-3 items-end">
                        <div className="flex-1">
                            <Textarea
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                placeholder="Write a reply..."
                                className="min-h-[88px] shadow-xl max-h-[200px] resize-none focus-visible:ring-primary bg-background"
                            />
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                            <div className="relative shadow-2xl">
                                <input
                                    type="file" id="file-upload" className="hidden"
                                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                />
                                <Button
                                    variant={selectedFile ? "secondary" : "outline"}
                                    size="icon"
                                    className={cn(selectedFile && "border-primary text-primary")}
                                    onClick={() => document.getElementById('file-upload')?.click()}
                                >
                                    <Upload className="h-4 w-4" />
                                </Button>
                            </div>

                            <Button onClick={handleReply} disabled={isPosting} size="icon" className="shadow-2xl">
                                {isPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                    {selectedFile && (
                        <div className="container max-w-4xl mx-auto text-xs text-muted-foreground mt-2 flex justify-between">
                            <span>Attached: {selectedFile.name}</span>
                            <span className="cursor-pointer hover:text-destructive" onClick={() => setSelectedFile(null)}>Remove</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
