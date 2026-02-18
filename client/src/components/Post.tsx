import { PostItem } from "@/types";
import { format } from "date-fns";
import * as Flags from "country-flag-icons/react/3x2";
import { ImageGallery } from "./ImageGallery";
import { Button } from "@/components/ui/button";
import { MessageSquare, ShieldAlert, Trash2, Ban } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface PostProps {
    post: PostItem;
    isOp?: boolean;
    onReply: (id: number) => void;
    onReport: (id: number) => void;
    onBan?: (ip: string, session: string) => void;
    onDelete?: (id: number) => void;
    onInvestigate?: (target: string) => void;
}

export function Post({ post, isOp, onReply, onReport, onBan, onDelete, onInvestigate }: PostProps) {
    const { model, images, cdn_url, admin_role } = post;

    // Dynamically load the flag component based on country code
    const FlagComponent = model.country_code ? (Flags as any)[model.country_code] : null;

    return (
        <div
            id={`p${model.id}`}
            className={cn(
                "p-4 rounded-lg border transition-colors",
                isOp
                    ? "bg-card mb-4"
                    : "bg-muted/30 border-l-4 border-l-primary/20 mb-2 ml-2 md:ml-8 hover:bg-muted/50"
            )}
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center flex-wrap gap-2 text-sm text-muted-foreground">
                    {/* Flag Display */}
                    {FlagComponent && (
                        <FlagComponent
                            className="w-5 h-4 shadow-sm rounded-[2px]"
                            title={model.country_code}
                        />
                    )}

                    <span className="font-semibold text-primary">Anonymous</span>

                    <span className="text-xs">
            {format(new Date(model.created_at), "MM/dd/yy(E)HH:mm:ss")}
          </span>

                    <span
                        className="cursor-pointer hover:underline text-foreground font-medium"
                        onClick={() => onReply(model.id)}
                    >
            No.{model.id}
          </span>

                    {/* Admin Info - Only visible to role >= 2 (Mods/Admins) */}
                    {admin_role >= 2 && (
                        <div className="flex items-center gap-2 ml-2 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded text-xs text-red-600 dark:text-red-400 font-mono border border-red-200 dark:border-red-900">
              <span
                  className="cursor-pointer hover:underline"
                  onClick={() => onInvestigate?.(model.ip_address!)}
                  title="Investigate IP"
              >
                {model.ip_address}
              </span>
                            <span>/</span>
                            <span
                                className="cursor-pointer hover:underline truncate max-w-[80px]"
                                onClick={() => onInvestigate?.(model.session_id!)}
                                title="Investigate Session"
                            >
                {model.session_id}
              </span>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-1 items-center">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onReply(model.id)}
                        title="Reply"
                    >
                        <MessageSquare className="w-4 h-4" />
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                <ShieldAlert className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => onReport(model.id)}>
                                Report Post
                            </DropdownMenuItem>

                            {/* Admin Actions */}
                            {admin_role >= 2 && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-red-500">Moderation</DropdownMenuLabel>
                                    <DropdownMenuItem
                                        className="text-red-600 focus:text-red-600 focus:bg-red-100 dark:focus:bg-red-900/20"
                                        onClick={() => onDelete?.(model.id)}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" /> Delete Post
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        className="text-red-600 focus:text-red-600 focus:bg-red-100 dark:focus:bg-red-900/20"
                                        onClick={() => onBan?.(model.ip_address!, model.session_id!)}
                                    >
                                        <Ban className="w-4 h-4 mr-2" /> Ban User
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Image Gallery */}
            <ImageGallery images={images} cdnUrl={cdn_url} />

            {/* Post Content with Green Text Support */}
            <div className="mt-2 text-sm leading-relaxed whitespace-pre-wrap break-words">
                {model.content.split('\n').map((line, i) => (
                    <p
                        key={i}
                        className={line.startsWith('>') && !line.startsWith('>>')
                            ? "text-green-600 dark:text-green-400"
                            : ""
                        }
                    >
                        {line}
                    </p>
                ))}
            </div>
        </div>
    );
}
