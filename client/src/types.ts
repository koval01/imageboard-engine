export interface Board {
    slug: string;
    name: string;
    description: string;
}

export interface BoardStat {
    model: Board;
    post_count: number;
}

export interface Image {
    id: number;
    url: string;
    thumbnail_url: string;
    filename: string;
    width: number;
    height: number;
    size: number;
    thread_id?: number | null;
    post_id?: number | null;
}

// Use Omit to remove the conflicting thread_id type before redefining it
export interface RecentImage extends Omit<Image, 'thread_id'> {
    thread_id: string;
}

export interface Post {
    id: number;
    thread_id: number;
    content: string;
    session_id: string;
    ip_address: string;
    country_code: string | null;
    created_at: string;
}

export interface PostItem {
    model: Post;
    images: Image[];
    cdn_url: string;
    admin_role: number;
    board_slug: string;
}

export interface Thread {
    id: number;
    board_slug: string;
    subject: string | null;
    content: string;
    session_id: string;
    country_code: string | null;
    ip_address: string;
    created_at: string;
    updated_at: string;
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

export interface HomeResponse {
    boards: BoardStat[];
    recent_images: RecentImage[];
    recent_threads: Thread[];
    cdn_url: string;
    admin_role: number;
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
