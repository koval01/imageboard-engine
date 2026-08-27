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
    const tags: Array<{ name: string; wrap: (inner: string) => React.ReactNode }> = [
        { name: 'mask', wrap: (inner) => <MaskedText text={inner} /> },
        { name: 'urlw', wrap: (inner) => <ClassifiedLink href={inner} warn /> },
        { name: 'url', wrap: (inner) => <ClassifiedLink href={inner} warn={false} /> },
        { name: 'spoiler', wrap: (inner) => <span className="ib-spoiler"><Markup text={inner} /></span> },
        { name: 'b', wrap: (inner) => <b><Markup text={inner} /></b> },
        { name: 'i', wrap: (inner) => <i><Markup text={inner} /></i> },
        { name: 's', wrap: (inner) => <s><Markup text={inner} /></s> },
        { name: 'u', wrap: (inner) => <u><Markup text={inner} /></u> },
    ]

    let best: { index: number; length: number; inner: string; wrap: (inner: string) => React.ReactNode } | null = null
    for (const tag of tags) {
        const re = new RegExp(`\\[${tag.name}\\]([\\s\\S]*?)\\[\\/${tag.name}\\]`, 'i')
        const match = re.exec(text)
        if (!match) continue
        if (!best || match.index < best.index) {
            best = { index: match.index, length: match[0].length, inner: match[1], wrap: tag.wrap }
        }
    }
    if (!best) return <>{text}</>
    const before = text.slice(0, best.index)
    const after = text.slice(best.index + best.length)
    return <>{before}{best.wrap(best.inner)}<Markup text={after} /></>
}

function httpHref(raw: string): string | null {
    const href = raw.trim()
    if (href.startsWith('https://') || href.startsWith('http://')) return href
    return null
}

const ClassifiedLink = ({ href, warn }: { href: string; warn: boolean }) => {
    const url = httpHref(href)
    if (!url) return <span className="ib-link-removed">[посилання видалено]</span>
    const open = (e: React.MouseEvent) => {
        if (!warn) return
        e.preventDefault()
        const ok = window.confirm(`Ви впевнені, що хочете перейти за цією адресою?\n\n${url}`)
        if (ok) window.open(url, '_blank', 'noopener,noreferrer')
    }
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={warn ? 'ib-link-warn' : 'ib-link-ok'}
            onClick={open}
        >
            {url}
        </a>
    )
}

const MaskedText = ({ text }: { text: string }) => {
    const [open, setOpen] = React.useState(false)
    if (open) return <span className="ib-mask ib-mask_open"><Markup text={text} /></span>
    return (
        <button
            type="button"
            className="ib-mask"
            title="Прихований текст"
            onClick={() => {
                if (window.confirm('Показати прихований текст?')) setOpen(true)
            }}
        >
            [****]
        </button>
    )
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
