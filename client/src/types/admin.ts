import type {Image, Post} from './models';

export interface AdminStats {
    total_posts: number;
    total_bans: number;
    total_reports: number;
    open_reports: number;
}

export interface AdminLog {
    id: number;
    admin_username: string;
    action: string;
    target_id: string | null;
    details: string | null;
    created_at: string;
}

export interface LogsResponse {
    data: AdminLog[];
    total_pages: number;
    current_page: number;
}

export interface Report {
    id: number;
    reason: string;
    status: string;
    reporter_ip: string;
    created_at: string;
    post: Post | null;
    images: Image[];
    board_slug: string | null;
}

export interface ReportsResponse {
    data: Report[];
    total_pages: number;
    current_page: number;
}

export interface InvestigationResult {
    initial_target: string;
    related_ips: string[];
    related_sessions: string[];
    posts_found: Post[];
    images_found: Image[];
    similar_images: [number, number, string][]; // [PostId, Distance, Url]
}

export interface VisualSearchResult {
    image: Image;
    distance: number;
    post: Post | null;
    board_slug: string | null;
}

export interface BanPayload {
    ip: string;
    session?: string;
    reason: string;
    duration: number; // hours
    delete_content: boolean;
}
