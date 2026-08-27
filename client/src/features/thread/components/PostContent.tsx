import React from 'react';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useLazyGetPostQuery } from '@/store/api/boardApi';
import { Post } from './Post';
import type { PostItem } from '@/types/api';
import IbSpinner from '@/components/common/IbSpinner';

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
    const COLLAPSE = 12
    const [open, setOpen] = React.useState(false)
    const collapsed = lines.length > COLLAPSE && !open
    const visible = collapsed ? lines.slice(0, COLLAPSE) : lines

    return (
        <div className="whitespace-pre-wrap break-words text-[1rem] leading-[1.35]">
            {visible.map((line, i) => (
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
            {collapsed && (
                <button type="button" className="mt-1 text-left" onClick={() => setOpen(true)}>
                    Показати текст повністю
                </button>
            )}
        </div>
    );
};

const Markup = ({ text }: { text: string }) => {
    const match = /\[(b|i|s|u|spoiler)\]([\s\S]*?)\[\/\1\]/i.exec(text)
    if (!match) return <>{text}</>
    const before = text.slice(0, match.index)
    const inner = match[2]
    const after = text.slice(match.index + match[0].length)
    const tag = match[1].toLowerCase()
    const wrapped =
        tag === 'b' ? <b><Markup text={inner} /></b>
        : tag === 'i' ? <i><Markup text={inner} /></i>
        : tag === 's' ? <s><Markup text={inner} /></s>
        : tag === 'u' ? <u><Markup text={inner} /></u>
        : <span className="ib-spoiler"><Markup text={inner} /></span>
    return <>{before}{wrapped}<Markup text={after} /></>
}

const LineParser = ({ line, boardSlug, currentThreadId, threadPosts, onQuoteClick }: {
    line: string
    boardSlug: string
    currentThreadId: number
    threadPosts?: PostItem[]
    onQuoteClick?: (id: number) => void
}) => {
    const replyRegex = />>(\d+)/g;
    const isGreentext = line.startsWith('>') && !line.startsWith('>>');

    if (!line.match(replyRegex)) {
        return <span className={isGreentext ? "ib-greentext" : ""}><Markup text={line} /></span>;
    }

    const parts = line.split(replyRegex);

    return (
        <span className={isGreentext ? "ib-greentext" : ""}>
            {parts.map((part: string, index: number) => {
                if (index % 2 === 0) return <Markup key={index} text={part} />;

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

const PostRef = ({ postId, boardSlug, currentThreadId, threadPosts, onClick }: {
    postId: number
    boardSlug: string
    currentThreadId: number
    threadPosts?: PostItem[]
    onClick?: (id: number) => void
}) => {
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
            element.classList.add('ib-flash');
            setTimeout(() => element.classList.remove('ib-flash'), 1500);
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
                    className="post-reply-link font-bold"
                >
                    &gt;&gt;{postId}
                </a>
            </HoverCardTrigger>
            <HoverCardContent
                className="w-[90vw] overflow-hidden p-0 md:w-[560px] z-50"
                align="start"
                side="top"
            >
                {postToDisplay ? (
                    <div className="bg-background">
                        <div className="flex justify-between border-b border-border px-2 py-1 text-xs text-muted-foreground">
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
                    <div className="p-4">
                        <IbSpinner label="Завантаження поста..." />
                    </div>
                ) : (
                    <div className="p-4 text-sm text-destructive">
                        Пост не знайдено або він був видалений.
                    </div>
                )}
            </HoverCardContent>
        </HoverCard>
    );
};
