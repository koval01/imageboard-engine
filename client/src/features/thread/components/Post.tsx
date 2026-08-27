import { useState } from 'react'
import type { ComponentType } from "react";
import type { PostItem } from "@/types/api";
import * as Flags from "country-flag-icons/react/3x2";
import { ImageGallery } from "@/components/common/ImageGallery";
import { ShieldAlert, Trash2, Ban, MoreHorizontal, EyeOff, Eye } from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PostContent } from "./PostContent";
import { formatPostTime } from "@/lib/format";
import { isFaved, toggleFav } from "@/components/common/BoardWidget";
import { useCheckAdminQuery } from "@/store/api/adminApi";

interface PostProps {
    post: PostItem;
    isOp?: boolean;
    isPreview?: boolean;
    threadPosts?: PostItem[];
    onReply: (id: number) => void;
    onReport: (id: number) => void;
    onBan?: (ip: string, session: string) => void;
    onDelete?: (id: number) => void;
    onHide?: (id: number, hidden: boolean) => void;
    onInvestigate?: (target: string) => void;
}

export function Post({
    post,
    isOp,
    isPreview,
    threadPosts,
    onReply,
    onReport,
    onBan,
    onDelete,
    onHide,
    onInvestigate
}: PostProps) {
    const { model, images, cdn_url, admin_role, board_slug } = post;
    const { data: staff } = useCheckAdminQuery(undefined, { skip: admin_role < 1 });
    const canViewIp = staff?.privileges?.view_ip ?? admin_role >= 2;
    const canDelete = staff?.privileges?.delete ?? admin_role >= 2;
    const canBan = staff?.privileges?.ban ?? admin_role >= 2;
    const canHide = Boolean(staff?.privileges?.hide);
    const FlagComponent = model.country_code ? (Flags as Record<string, ComponentType<{ className?: string; title?: string }>>)[model.country_code] : null;
    const subject = "subject" in model ? (model as { subject?: string | null }).subject : undefined;
    const [faved, setFaved] = useState(() => isFaved(board_slug, model.thread_id));

    return (
        <article
            id={`p${model.id}`}
            className={cn(
                "ib-post scroll-mt-16",
                isPreview ? "bg-transparent p-2" : isOp ? "ib-op post post_type_oppost" : "ib-reply post post_type_reply",
                model.is_hidden && "opacity-60",
            )}
        >
            <div className="post__details">
                {isOp && subject && (
                    <span className="post__detailpart">
                        <span className="ib-title post__title">{subject}</span>
                    </span>
                )}
                {FlagComponent && (
                    <FlagComponent className="h-3 w-4 rounded-[1px]" title={model.country_code || "Невідомо"} />
                )}
                <span className="post__detailpart">
                    <span className="post__anon">Анонім</span>
                </span>
                <span className="post__detailpart">
                    <span className="post__time">{formatPostTime(model.created_at)}</span>
                </span>
                <span className="post__detailpart">
                    <button
                        type="button"
                        onClick={() => onReply(model.id)}
                        className="post__reflink"
                    >
                        №{model.id}
                    </button>
                </span>

                {canViewIp && !isPreview && model.ip_address && (
                    <span className="post__detailpart font-mono text-[10px]">
                        <button
                            type="button"
                            onClick={() => onInvestigate?.(model.ip_address || '')}
                            className="text-destructive hover:underline"
                            title="Перевірити IP"
                        >
                            {model.ip_address}
                        </button>
                        {' '}
                        <button
                            type="button"
                            onClick={() => onInvestigate?.(model.session_id || '')}
                            className="max-w-[72px] truncate text-primary hover:underline"
                            title="Перевірити сесію"
                        >
                            {model.session_id}
                        </button>
                    </span>
                )}

                {!isPreview && (
                    <>
                        {isOp && (
                            <button
                                type="button"
                                className={cn(faved && "text-primary")}
                                title="Обране"
                                onClick={() => {
                                    toggleFav({
                                        slug: board_slug,
                                        id: model.thread_id,
                                        title: subject || model.content.slice(0, 60),
                                    });
                                    setFaved(isFaved(board_slug, model.thread_id));
                                }}
                            >
                                {faved ? "★" : "☆"}
                            </button>
                        )}
                        <button type="button" className="post__reflink" onClick={() => onReply(model.id)}>
                            Відповідь
                        </button>
                        <button
                            type="button"
                            data-testid="report-post"
                            aria-label="Поскаржитись"
                            title="Поскаржитись"
                            onClick={() => onReport(model.id)}
                        >
                            <ShieldAlert className="inline h-3.5 w-3.5 align-text-top" />
                        </button>
                        {canHide && (
                            <button
                                type="button"
                                className="text-destructive"
                                data-testid="hide-content"
                                aria-label={model.is_hidden ? 'Показати' : 'Приховати'}
                                title={model.is_hidden ? 'Показати' : 'Приховати'}
                                onClick={() => onHide?.(model.id, !model.is_hidden)}
                            >
                                {model.is_hidden ? <Eye className="inline h-3.5 w-3.5 align-text-top" /> : <EyeOff className="inline h-3.5 w-3.5 align-text-top" />}
                            </button>
                        )}
                        {canDelete && (
                            <button
                                type="button"
                                className="text-destructive"
                                data-testid="delete-content"
                                aria-label="Видалити"
                                title="Видалити"
                                onClick={() => onDelete?.(model.id)}
                            >
                                <Trash2 className="inline h-3.5 w-3.5 align-text-top" />
                            </button>
                        )}
                        {canBan && (
                            <button
                                type="button"
                                className="text-destructive"
                                data-testid="ban-user"
                                aria-label="Забанити"
                                title="Забанити"
                                onClick={() => onBan?.(model.ip_address || '', model.session_id || '')}
                            >
                                <Ban className="inline h-3.5 w-3.5 align-text-top" />
                            </button>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button type="button" data-testid="post-menu" aria-label="Меню">
                                    <MoreHorizontal className="inline h-3.5 w-3.5 align-text-top" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onReport(model.id)}>
                                    <ShieldAlert className="mr-2 h-4 w-4" /> Поскаржитись
                                </DropdownMenuItem>
                                {(canHide || canDelete || canBan) && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-destructive">Адмін меню</DropdownMenuLabel>
                                        {canHide && (
                                            <DropdownMenuItem onClick={() => onHide?.(model.id, !model.is_hidden)}>
                                                {model.is_hidden ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
                                                {model.is_hidden ? 'Показати' : 'Приховати'}
                                            </DropdownMenuItem>
                                        )}
                                        {canDelete && (
                                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete?.(model.id)}>
                                                <Trash2 className="mr-2 h-4 w-4" /> Видалити
                                            </DropdownMenuItem>
                                        )}
                                        {canBan && (
                                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onBan?.(model.ip_address || '', model.session_id || '')}>
                                                <Ban className="mr-2 h-4 w-4" /> Забанити
                                            </DropdownMenuItem>
                                        )}
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                )}
            </div>

            <div className="post__message clearfix">
                {images.length > 0 && (
                    <ImageGallery images={images} cdnUrl={cdn_url} />
                )}
                <blockquote className="post__comment">
                    <PostContent
                        content={model.content}
                        boardSlug={board_slug}
                        currentThreadId={model.thread_id}
                        threadPosts={threadPosts}
                        onQuoteClick={(postId) => {
                            window.location.hash = `p${postId}`;
                        }}
                    />
                </blockquote>
            </div>
        </article>
    );
}
