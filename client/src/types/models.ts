export interface Board {
    id: number;
    slug: string;
    name: string;
    description: string;
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
    board_id?: number | null;
}

export interface Post {
    id: number;
    thread_id: number;
    content: string;
    session_id?: string;
    ip_address?: string;
    country_code: string | null;
    created_at: string;
    is_hidden?: boolean;
}

export interface Thread {
    id: number;
    board_slug: string;
    subject: string | null;
    content: string;
    session_id?: string;
    country_code: string | null;
    ip_address?: string;
    created_at: string;
    updated_at: string;
    is_hidden?: boolean;
}
