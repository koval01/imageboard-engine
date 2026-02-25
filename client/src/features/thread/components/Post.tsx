import type { PostItem } from "@/types/api";
import { format } from "date-fns";
import * as Flags from "country-flag-icons/react/3x2";
import { ImageGallery } from "@/components/common/ImageGallery";
import { Button } from "@/components/ui/button";
import { MessageSquare, ShieldAlert, Trash2, Ban, MoreHorizontal, Copy } from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { uk } from "date-fns/locale";
import { PostContent } from "./PostContent";
import { toast } from "sonner";

interface PostProps {
    post: PostItem;
    isOp?: boolean;
    isPreview?: boolean;
    threadPosts?: PostItem[];
    onReply: (id: number) => void;
    onReport: (id: number) => void;
    onBan?: (ip: string, session: string) => void;
    onDelete?: (id: number) => void;
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
                         onInvestigate
                     }: PostProps) {
    const { model, images, cdn_url, admin_role, board_slug } = post;
    const FlagComponent = model.country_code ? (Flags as any)[model.country_code] : null;

    const copyLink = () => {
        const url = `${window.location.origin}/${board_slug}/thread/${model.thread_id}#p${model.id}`;
        navigator.clipboard.writeText(url);
        toast.success("Посилання скопійовано");
    };

    return (
        <div
            id={`p${model.id}`}
            className={cn(
                "relative group transition-all duration-300 scroll-mt-20",
                isOp
                    ? "mb-6"
                    : "mb-3",
                isPreview
                    ? "border-0 bg-transparent p-3"
                    : isOp
                        ? "rounded-xl border bg-card p-4 md:p-6 shadow-sm"
                        : "rounded-lg border bg-card/50 p-3 md:p-4 hover:border-primary/30 hover:shadow-sm ml-0 md:ml-2"
            )}
        >
            <div className="flex justify-between items-start mb-3 pb-2 border-b border-border/40">
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground/80">
                    <div className="flex items-center gap-2">
                        {FlagComponent && (
                            <FlagComponent className="w-5 h-3.5 shadow-sm rounded-[2px]" title={model.country_code || "Unknown"} />
                        )}
                        <span className="font-bold text-foreground/90">Анонім</span>
                    </div>

                    <span className="text-xs opacity-70">
                        {format(new Date(model.created_at), "dd.MM.yy HH:mm", { locale: uk })}
                    </span>

                    <button
                        onClick={() => onReply(model.id)}
                        className="font-mono text-xs hover:text-primary transition-colors cursor-pointer select-text"
                    >
                        №{model.id}
                    </button>

                    {admin_role >= 2 && !isPreview && (
                        <div className="flex items-center gap-1.5 ml-2">
                            <button
                                onClick={() => onInvestigate?.(model.ip_address)}
                                className="px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-mono hover:bg-red-500/20 transition-colors border border-red-500/20"
                                title="Check IP"
                            >
                                {model.ip_address}
                            </button>
                            <button
                                onClick={() => onInvestigate?.(model.session_id)}
                                className="px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-mono hover:bg-orange-500/20 transition-colors border border-orange-500/20 truncate max-w-[60px]"
                                title="Check Session"
                            >
                                {model.session_id}
                            </button>
                        </div>
                    )}
                </div>

                {!isPreview && (
                    <div className="flex gap-1 items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyLink} title="Копіювати посилання">
                            <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onReply(model.id)} title="Відповісти">
                            <MessageSquare className="w-3.5 h-3.5" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6"><MoreHorizontal className="w-3.5 h-3.5" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onReport(model.id)}>
                                    <ShieldAlert className="w-4 h-4 mr-2" /> Поскаржитись
                                </DropdownMenuItem>
                                {admin_role >= 2 && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel className="text-red-500 text-xs uppercase tracking-wider">Адмін меню</DropdownMenuLabel>
                                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete?.(model.id)}>
                                            <Trash2 className="w-4 h-4 mr-2" /> Видалити
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onBan?.(model.ip_address, model.session_id)}>
                                            <Ban className="w-4 h-4 mr-2" /> Забанити
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>

            <div className={cn("grid gap-4", images.length > 0 && "sm:grid-cols-[auto_1fr]")}>
                {images.length > 0 && (
                    <div className="shrink-0 max-w-full sm:max-w-[200px]">
                        <ImageGallery images={images} cdnUrl={cdn_url} />
                    </div>
                )}

                <div className="min-w-0">
                    <PostContent
                        content={model.content}
                        boardSlug={board_slug}
                        currentThreadId={model.thread_id}
                        threadPosts={threadPosts}
                        onQuoteClick={(id) => {
                            window.location.hash = `p${id}`;
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
