import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGetThreadQuery, usePostReplyMutation, useReportPostMutation } from "@/store/api/boardApi";
import { useBanUserMutation, useDeleteContentMutation } from "@/store/api/adminApi";
import { Post } from "@/features/thread/components/Post";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Upload, Send, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostItem } from "@/types/api";

export default function ThreadPage() {
    const { slug, id } = useParams();
    const threadId = parseInt(id || "0");
    const navigate = useNavigate();

    const { data, isLoading, refetch } = useGetThreadQuery({ slug: slug!, id: threadId }, { pollingInterval: 5000 });
    const [postReply, { isLoading: isPosting }] = usePostReplyMutation();
    const [banUser] = useBanUserMutation();
    const [deleteContent] = useDeleteContentMutation();
    const [reportPost] = useReportPostMutation();

    const [replyContent, setReplyContent] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const prevPostCount = useRef(0);

    useEffect(() => {
        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
            const atBottom = scrollHeight - scrollTop - clientHeight < 150;
            setIsAtBottom(atBottom);
            if (atBottom) setUnreadCount(0);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        if (!data) return;
        const currentCount = data.replies.length;
        if (prevPostCount.current === 0 && currentCount > 0) {
            if (!window.location.hash) setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }), 50);
        } else if (currentCount > prevPostCount.current) {
            const newPosts = currentCount - prevPostCount.current;
            if (isAtBottom) {
                setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 100);
                setUnreadCount(0);
            } else {
                setUnreadCount(prev => prev + newPosts);
            }
        }
        prevPostCount.current = currentCount;
    }, [data, isAtBottom]);

    const handleReply = async () => {
        if (!replyContent.trim() && !selectedFile) { toast.error("Введіть текст"); return; }
        const formData = new FormData();
        formData.append("content", replyContent);
        if (selectedFile) formData.append("file", selectedFile);
        try {
            await postReply({ slug: slug!, id: threadId, formData }).unwrap();
            setReplyContent(""); setSelectedFile(null); refetch(); toast.success("Відповідь надіслано");
            window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        } catch (err: any) { toast.error(err?.data?.error || "Помилка"); }
    };

    const quotePost = (postId: number) => setReplyContent(prev => `${prev}${prev.length && !prev.endsWith('\n') ? '\n' : ''}>>${postId}\n`);
    const handleBan = async (ip: string, session: string) => { if (confirm("Ban?")) await banUser({ ip, session, reason: "Ban", duration: 24, delete_content: true }); refetch(); };
    const handleDelete = async (itemId: number, type: 'post' | 'thread') => { if(confirm("Delete?")) { await deleteContent({ id: itemId, type_: type }); type === 'thread' ? navigate(`/${slug}`) : refetch(); }};

    if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (!data) return <div className="container py-10">Тред не знайдено</div>;

    const opPost: PostItem = { model: { ...data.thread, thread_id: data.thread.id, id: data.thread.id } as any, images: data.op_images, cdn_url: data.cdn_url, admin_role: data.admin_role, board_slug: data.board.slug, thread_id: data.thread.id };

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <div className="container max-w-4xl mx-auto py-6 flex-1">
                <Button variant="ghost" className="mb-4 pl-0" onClick={() => navigate(`/${slug}`)}>&larr; Назад до /{data.board.slug}/</Button>
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-primary mb-2 break-words">{data.thread.subject || "Без теми"}</h1>
                    <Post post={opPost} isOp onReply={quotePost} onReport={(id) => reportPost({ post_id: id, reason: "Report" })} onBan={handleBan} onDelete={(id) => handleDelete(id, 'thread')} onInvestigate={(t) => window.open(`/admin?target=${t}`, '_blank')} />
                </div>
                <Separator className="my-6" />
                <div className="space-y-1">
                    {data.replies.map((post) => (
                        <Post key={post.model.id} post={post} onReply={quotePost} onReport={(id) => reportPost({ post_id: id, reason: "Report" })} onBan={handleBan} onDelete={(id) => handleDelete(id, 'post')} onInvestigate={(t) => window.open(`/admin?target=${t}`, '_blank')} />
                    ))}
                </div>
            </div>

            <div className="sticky bottom-0 z-40 w-full bg-background/80 backdrop-blur-md border-t">
                {unreadCount > 0 && (
                    <div className="absolute -top-12 left-0 w-full flex justify-center pointer-events-none">
                        <Button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })} className="pointer-events-auto rounded-full shadow-xl bg-primary text-primary-foreground animate-in fade-in slide-in-from-bottom-2">
                            <ArrowDown className="mr-2 h-4 w-4" /> {unreadCount} нових постів
                        </Button>
                    </div>
                )}
                <div className="max-w-[700px] p-2 m-auto container flex gap-3 items-end">
                    <div className="flex-1"><Textarea value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder="Написати відповідь..." className="min-h-[60px] max-h-[200px] bg-background" /></div>
                    <div className="flex flex-col gap-2 shrink-0">
                        <div className="relative">
                            <input type="file" id="file-upload" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                            <Button variant={selectedFile ? "secondary" : "outline"} size="icon" className={cn(selectedFile && "border-primary text-primary")} onClick={() => document.getElementById('file-upload')?.click()}><Upload className="h-4 w-4" /></Button>
                        </div>
                        <Button onClick={handleReply} disabled={isPosting} size="icon">{isPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
                    </div>
                </div>
                {selectedFile && <div className="text-center text-xs text-muted-foreground pb-1">Файл: {selectedFile.name}</div>}
            </div>
        </div>
    );
}
