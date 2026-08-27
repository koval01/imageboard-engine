import type {Board, Image, Post, Thread} from './models';

export interface PostItem {
    model: Post;
    images: Image[];
    cdn_url: string;
    thread_id: number;
    admin_role: number;
    board_slug: string;
}

export interface ThreadItem {
    model: Thread;
    images: Image[];
    replies_preview: PostItem[];
    reply_count: number;
    image_count: number;
    omitted_posts: number;
    omitted_images: number;
    is_bump_limit: boolean;
    is_time_limit: boolean;
}

export interface BoardStat {
    model: Board;
    post_count: number;
}

export interface RecentImage extends Omit<Image, 'thread_id'> {
    thread_id: string;
    board_slug: string;
}

export interface HomeResponse {
    boards: BoardStat[];
    recent_images: RecentImage[];
    recent_threads: Thread[];
    cdn_url: string;
    admin_role: number;
    turnstile_site_key?: string | null;
}

export interface BoardResponse {
    board: Board;
    threads: ThreadItem[];
    cdn_url: string;
    admin_role: number;
}

export interface ThreadResponse {
    board: Board;
    thread: Thread;
    op_images: Image[];
    replies: PostItem[];
    cdn_url: string;
    admin_role: number;
    last_post_id: number;
    is_bump_limit: boolean;
    is_time_limit: boolean;
}

export interface SinglePostResponse {
    post: PostItem;
}
