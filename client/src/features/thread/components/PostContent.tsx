import React from 'react';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useLazyGetPostQuery } from '@/store/api/boardApi';
import { Post } from './Post';
import type { PostItem } from '@/types/api';
import { Loader2 } from 'lucide-react';

interface PostContentProps {
    content: string;
    boardSlug: string;
    currentThreadId: number;
    threadPosts?: PostItem[];
    onQuoteClick?: (id: number) => void;
}

export const PostContent: React.FC<PostContentProps> = ({
                                                            content,
                                                            boardSlug,
                                                            currentThreadId,
                                                            threadPosts,
                                                            onQuoteClick
                                                        }) => {
    const lines = content.split('\n');

    return (
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words font-medium text-foreground/90">
            {lines.map((line, i) => (
                <div key={i} className="min-h-[1.2em]">
                    <LineParser
                        line={line}
                        boardSlug={boardSlug}
                        currentThreadId={currentThreadId}
                        threadPosts={threadPosts}
                        onQuoteClick={onQuoteClick}
                    />
                </div>
            ))}
        </div>
    );
};

const LineParser = ({ line, boardSlug, currentThreadId, threadPosts, onQuoteClick }: any) => {
    const replyRegex = />>(\d+)/g;
    const isGreentext = line.startsWith('>') && !line.startsWith('>>');

    if (!line.match(replyRegex)) {
        return <span className={isGreentext ? "text-green-600 dark:text-green-400 font-normal" : ""}>{line}</span>;
    }

    const parts = line.split(replyRegex);

    return (
        <span className={isGreentext ? "text-green-600 dark:text-green-400" : ""}>
            {parts.map((part: string, index: number) => {
                if (index % 2 === 0) return part;

                const postId = parseInt(part);
                return (
                    <PostRef
                        key={index}
                        postId={postId}
                        boardSlug={boardSlug}
                        currentThreadId={currentThreadId}
                        threadPosts={threadPosts}
                        onClick={onQuoteClick}
                    />
                );
            })}
        </span>
    );
};

const PostRef = ({ postId, boardSlug, currentThreadId, threadPosts, onClick }: any) => {
    const [triggerPost, { data, isFetching }] = useLazyGetPostQuery();
    const localPost = threadPosts?.find((p: PostItem) => p.model.id === postId);

    const handleMouseEnter = () => {
        if (!localPost && !data) {
            triggerPost(postId);
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();

        const element = document.getElementById(`p${postId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('bg-primary/10', 'ring-2', 'ring-primary');
            setTimeout(() => {
                element.classList.remove('bg-primary/10', 'ring-2', 'ring-primary');
            }, 1500);
        } else if (onClick) {
            onClick(postId);
        }
    };

    const postToDisplay = localPost || data?.post;

    return (
        <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
                <a
                    href={`/${boardSlug}/thread/${currentThreadId}#p${postId}`}
                    onClick={handleClick}
                    onMouseEnter={handleMouseEnter}
                    className="text-primary hover:underline cursor-pointer font-bold decoration-primary/50 underline-offset-2"
                >
                    &gt;&gt;{postId}
                </a>
            </HoverCardTrigger>
            <HoverCardContent
                className="w-[90vw] md:w-[600px] p-0 overflow-hidden shadow-xl border-primary/20 z-50"
                align="start"
                side="top"
            >
                {postToDisplay ? (
                    <div className="bg-background">
                        <div className="bg-muted/50 p-2 text-xs text-muted-foreground border-b flex justify-between">
                            <span>Відповідь на: {postId}</span>
                            {localPost ? <span>(в цьому треді)</span> : <span>(завантажено)</span>}
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto">
                            <Post
                                post={postToDisplay}
                                onReply={() => {}}
                                onReport={() => {}}
                                isPreview={true}
                            />
                        </div>
                    </div>
                ) : isFetching ? (
                    <div className="p-4 flex items-center justify-center text-muted-foreground gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Завантаження поста...
                    </div>
                ) : (
                    <div className="p-4 text-destructive text-sm">
                        Пост не знайдено або він був видалений.
                    </div>
                )}
            </HoverCardContent>
        </HoverCard>
    );
};
