import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGetThreadQuery, useReportPostMutation } from "@/store/api/boardApi";
import { useBanUserMutation, useDeleteContentMutation, useHideContentMutation } from "@/store/api/adminApi";
import { Post } from "@/features/thread/components/Post";
import { toast } from "sonner";
import type { PostItem } from "@/types/api";
import ThreadNav from "@/components/common/ThreadNav";
import IbSpinner from "@/components/common/IbSpinner";
import { usePostForm } from "@/components/common/PostFormContext";

export default function ThreadPage() {
    const { slug, id } = useParams();
    const threadId = parseInt(id || "0");
    const navigate = useNavigate();
    const { setOpen, setQuoteInsert } = usePostForm();
    const [autoUpdate, setAutoUpdate] = useState(true);
    const [search, setSearch] = useState("");

    const { data, isLoading, refetch, isFetching } = useGetThreadQuery(
        { slug: slug!, id: threadId },
        { pollingInterval: autoUpdate ? 3000 : 0 },
    );

    const [banUser] = useBanUserMutation();
    const [deleteContent] = useDeleteContentMutation();
    const [hideContent] = useHideContentMutation();
    const [reportPost] = useReportPostMutation();
    const [refreshing, setRefreshing] = useState(false);

    const [newPostsCount, setNewPostsCount] = useState(0);
    const [isUserAtBottom, setIsUserAtBottom] = useState(true);
    const prevPostsLength = useRef(0);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
            const isBottom = scrollHeight - scrollTop - clientHeight < 200;
            setIsUserAtBottom(isBottom);
            if (isBottom) setNewPostsCount(0);
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        if (!data) return;
        const currentLength = data.replies.length;
        if (prevPostsLength.current !== 0 && currentLength > prevPostsLength.current) {
            const addedCount = currentLength - prevPostsLength.current;
            if (isUserAtBottom) {
                setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
                setNewPostsCount(0);
            } else {
                setNewPostsCount((prev) => prev + addedCount);
            }
        }
        prevPostsLength.current = currentLength;
    }, [data, isUserAtBottom]);

    const quotePost = (postId: number) => {
        setOpen(true);
        setQuoteInsert(`>>${postId}\n`);
    };

    const handleReport = async (postId: number) => {
        try {
            await reportPost({ post_id: postId, reason: "Скарга" }).unwrap();
            toast.success("Скаргу надіслано");
        } catch (err: unknown) {
            const msg = (err as { data?: { error?: string } })?.data?.error;
            toast.error(msg || "Не вдалося надіслати скаргу");
        }
    };

    const handleHide = async (postId: number, hidden: boolean) => {
        const isOp = postId === threadId;
        await hideContent({ id: postId, type_: isOp ? "thread" : "post", hidden });
        refetch();
    };

    const handleBan = async (ip: string, session: string) => {
        if (confirm("Забанити користувача?")) await banUser({ ip, session, reason: "Бан", duration: 24, delete_content: true });
        refetch();
    };

    const handleDelete = async (itemId: number, type: "post" | "thread") => {
        if (confirm("Видалити назавжди?")) {
            await deleteContent({ id: itemId, type_: type });
            if (type === "thread") navigate(`/${slug}`);
            else refetch();
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await refetch();
        } finally {
            setRefreshing(false);
        }
    };

    if (!data && !isLoading) return <div className="py-8 text-center">Тред не знайдено або видалено.</div>;

    const opPost: PostItem | null = data
        ? {
            model: { ...data.thread, thread_id: data.thread.id, id: data.thread.id } as PostItem["model"],
            images: data.op_images,
            cdn_url: data.cdn_url,
            admin_role: data.admin_role,
            board_slug: data.board.slug,
            thread_id: data.thread.id,
        }
        : null;
    const allPosts = opPost ? [opPost, ...(data?.replies ?? [])] : [];
    const needle = search.trim().toLowerCase();
    const visibleReplies = needle
        ? (data?.replies ?? []).filter((p) => p.model.content.toLowerCase().includes(needle))
        : (data?.replies ?? []);

    const nav = (
        <ThreadNav
            boardSlug={slug!}
            mode="thread"
            onRefresh={onRefresh}
            refreshing={refreshing}
            autoUpdate={autoUpdate}
            onAutoUpdate={setAutoUpdate}
            search={search}
            onSearch={setSearch}
            onReply={() => setOpen(true)}
        />
    );

    return (
        <div className="relative pb-8">
            {newPostsCount > 0 && (
                <button
                    type="button"
                    onClick={() => {
                        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                        setNewPostsCount(0);
                    }}
                    className="fixed left-1/2 top-8 z-40 -translate-x-1/2 border border-border bg-card px-3 py-1 text-sm shadow"
                >
                    {newPostsCount} нових повідомлень
                </button>
            )}

            {nav}

            {isLoading && !data && (
                <div className="ib-reply my-3 min-h-[96px]">
                    <IbSpinner className="p-4" label="Завантаження…" />
                </div>
            )}

            {opPost && data && (
                <>
                    <Post
                        post={opPost}
                        isOp
                        onReply={quotePost}
                        onReport={handleReport}
                        onBan={handleBan}
                        onDelete={(postId) => handleDelete(postId, "thread")}
                        onHide={handleHide}
                        onInvestigate={(t) => window.open(`/admin?target=${t}`, "_blank")}
                        threadPosts={allPosts}
                    />

                    {isFetching && data.replies.length === 0 && (
                        <p className="ib-missed py-1"><IbSpinner label="завантаження постів…" /></p>
                    )}

                    {visibleReplies.map((post) => (
                        <Post
                            key={post.model.id}
                            post={post}
                            onReply={quotePost}
                            onReport={handleReport}
                            onBan={handleBan}
                            onDelete={(postId) => handleDelete(postId, "post")}
                            onHide={handleHide}
                            onInvestigate={(t) => window.open(`/admin?target=${t}`, "_blank")}
                            threadPosts={allPosts}
                        />
                    ))}
                </>
            )}

            <div ref={bottomRef} className="h-3" />
            {nav}
        </div>
    );
}
