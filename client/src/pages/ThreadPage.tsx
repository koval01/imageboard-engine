import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGetThreadQuery, usePostReplyMutation, useReportPostMutation } from "@/store/api/boardApi";
import { useBanUserMutation, useDeleteContentMutation } from "@/store/api/adminApi";
import { Post } from "@/features/thread/components/Post";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Upload, Send, ArrowUp, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostItem } from "@/types/api";
import { AnimatePresence, motion } from "framer-motion";

export default function ThreadPage() {
    const { slug, id } = useParams();
    const threadId = parseInt(id || "0");
    const navigate = useNavigate();

    const { data, isLoading, refetch, isFetching } = useGetThreadQuery({ slug: slug!, id: threadId }, { pollingInterval: 3000 });

    const [postReply, { isLoading: isPosting }] = usePostReplyMutation();
    const [banUser] = useBanUserMutation();
    const [deleteContent] = useDeleteContentMutation();
    const [reportPost] = useReportPostMutation();

    const [replyContent, setReplyContent] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const [newPostsCount, setNewPostsCount] = useState(0);
    const [isUserAtBottom, setIsUserAtBottom] = useState(true);
    const prevPostsLength = useRef(0);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
            const isBottom = scrollHeight - scrollTop - clientHeight < 200;
            setIsUserAtBottom(isBottom);

            if (isBottom) {
                setNewPostsCount(0);
            }
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        if (!data) return;

        const currentLength = data.replies.length;

        if (prevPostsLength.current === 0 && currentLength > 0) {
            if (!window.location.hash) {
                // No auto-scroll on load unless hash present
            }
        } else if (currentLength > prevPostsLength.current) {
            const addedCount = currentLength - prevPostsLength.current;

            if (isUserAtBottom) {
                setTimeout(() => {
                    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
                setNewPostsCount(0);
            } else {
                setNewPostsCount(prev => prev + addedCount);
            }
        }

        prevPostsLength.current = currentLength;
    }, [data, isUserAtBottom]);

    const handleReply = async () => {
        if (!replyContent.trim() && !selectedFile) { toast.error("Введіть текст або файл"); return; }
        const formData = new FormData();
        formData.append("content", replyContent);
        if (selectedFile) formData.append("file", selectedFile);
        try {
            await postReply({ slug: slug!, id: threadId, formData }).unwrap();
            setReplyContent("");
            setSelectedFile(null);
            refetch();
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
            toast.success("Відповідь надіслано");
        } catch (err: any) { toast.error(err?.data?.error || "Помилка"); }
    };

    const quotePost = (postId: number) => {
        setReplyContent(prev => `${prev}${prev.length && !prev.endsWith('\n') ? '\n' : ''}>>${postId}\n`);
        const textarea = document.querySelector('textarea');
        textarea?.focus();
    };

    const handleBan = async (ip: string, session: string) => { if (confirm("Ban?")) await banUser({ ip, session, reason: "Ban", duration: 24, delete_content: true }); refetch(); };
    const handleDelete = async (itemId: number, type: 'post' | 'thread') => {
        if(confirm("Delete?")) {
            await deleteContent({ id: itemId, type_: type });
            if (type === 'thread') navigate(`/${slug}`);
            else refetch();
        }
    };

    const scrollToNewPosts = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        setNewPostsCount(0);
    };

    if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary h-10 w-10" /></div>;
    if (!data) return <div className="container py-10 text-center">Тред не знайдено або видалено.</div>;

    const opPost: PostItem = { model: { ...data.thread, thread_id: data.thread.id, id: data.thread.id } as any, images: data.op_images, cdn_url: data.cdn_url, admin_role: data.admin_role, board_slug: data.board.slug, thread_id: data.thread.id };
    const allPosts = [opPost, ...data.replies];

    return (
        <div className="min-h-screen flex flex-col bg-background relative">
            <AnimatePresence>
                {newPostsCount > 0 && (
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -50, opacity: 0 }}
                        className="fixed top-16 left-0 right-0 z-40 flex justify-center pointer-events-none"
                    >
                        <Button
                            onClick={scrollToNewPosts}
                            className="pointer-events-auto rounded-full shadow-xl bg-primary/90 backdrop-blur text-primary-foreground border border-primary/20 hover:bg-primary gap-2"
                        >
                            <RefreshCcw className="h-4 w-4 animate-spin-slow" />
                            <span>{newPostsCount} нових повідомлень</span>
                            <ArrowUp className="h-4 w-4 rotate-180" />
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="container max-w-5xl mx-auto py-6 flex-1 px-4 sm:px-6">
                <div className="flex justify-between items-center mb-6">
                    <Button variant="ghost" className="pl-0 hover:bg-transparent hover:text-primary" onClick={() => navigate(`/${slug}`)}>
                        &larr; Назад у /{data.board.slug}/
                    </Button>
                    <div className="text-xs text-muted-foreground font-mono flex gap-2">
                        {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
                        <span>Оновлено: {new Date().toLocaleTimeString()}</span>
                    </div>
                </div>

                <div className="mb-8">
                    {data.thread.subject && (
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4 break-words leading-tight">
                            {data.thread.subject}
                        </h1>
                    )}
                    <Post
                        post={opPost}
                        isOp
                        onReply={quotePost}
                        onReport={(id) => reportPost({ post_id: id, reason: "Report" })}
                        onBan={handleBan}
                        onDelete={(id) => handleDelete(id, 'thread')}
                        onInvestigate={(t) => window.open(`/admin?target=${t}`, '_blank')}
                        threadPosts={allPosts}
                    />
                </div>

                <div className="space-y-4">
                    {data.replies.map((post) => (
                        <Post
                            key={post.model.id}
                            post={post}
                            onReply={quotePost}
                            onReport={(id) => reportPost({ post_id: id, reason: "Report" })}
                            onBan={handleBan}
                            onDelete={(id) => handleDelete(id, 'post')}
                            onInvestigate={(t) => window.open(`/admin?target=${t}`, '_blank')}
                            threadPosts={allPosts}
                        />
                    ))}
                </div>

                <div ref={bottomRef} className="h-4" />
            </div>

            <div className="sticky bottom-0 z-40 w-full bg-background/80 backdrop-blur-xl border-t border-border/60 p-4">
                <div className="max-w-4xl mx-auto flex gap-3 items-end">
                    <div className="flex-1 relative">
                        <Textarea
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder="Написати відповідь... (Ctrl+Enter to send)"
                            className="min-h-[50px] max-h-[200px] bg-background/50 focus:bg-background resize-none py-3 pr-10"
                            onKeyDown={(e) => {
                                if (e.ctrlKey && e.key === 'Enter') handleReply();
                            }}
                        />
                        <div className="absolute right-2 bottom-2 text-[10px] text-muted-foreground opacity-50 hidden sm:block">
                            Ctrl+Enter
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                        <div className="relative">
                            <input type="file" id="file-upload" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                            <Button
                                variant={selectedFile ? "default" : "outline"}
                                size="icon"
                                className={cn("h-10 w-10 transition-all", selectedFile && "ring-2 ring-primary ring-offset-2")}
                                onClick={() => document.getElementById('file-upload')?.click()}
                                title={selectedFile ? selectedFile.name : "Прикріпити файл"}
                            >
                                <Upload className="h-5 w-5" />
                            </Button>
                            {selectedFile && (
                                <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">1</span>
                            )}
                        </div>
                        <Button onClick={handleReply} disabled={isPosting} size="icon" className="h-10 w-10">
                            {isPosting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
