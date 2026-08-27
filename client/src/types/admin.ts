import type {Image, Post} from './models';

export interface Privileges {
    hide: boolean
    delete: boolean
    ban: boolean
    view_ip: boolean
    manage_staff: boolean
}

export interface AdminStatus {
    status: string
    role: number
    username?: string
    hours_active?: boolean
    privileges?: Privileges
}

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
    ip_address?: string | null;
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
    cidr?: string;
    scope?: 'site' | 'board';
    board_slug?: string;
    kind?: 'post' | 'view';
}

export interface StaffMember {
    id: number
    username: string
    role: number
    privileges: Privileges
    overrides: Record<string, boolean>
    work_start: string | null
    work_end: string | null
    timezone: string
    rate_limit_per_hour: number | null
    disabled: boolean
    last_login_at: string | null
    last_login_ip: string | null
    created_at: string
    is_super: boolean
}

export interface StaffSettings {
    default_rate_limit_per_hour: number
    default_work_start: string | null
    default_work_end: string | null
    timezone: string
}

export interface BanRecord {
    id: number
    ip_address: string | null
    session_id: string | null
    reason: string | null
    expires_at: string
    created_at: string
    cidr: string | null
    scope: string
    board_slug: string | null
    kind: string
    created_by: string | null
}

export interface CidrSample {
    ip: string
    isp?: string | null
    asn?: string | null
    country?: string | null
}

export interface CidrPreview {
    cidr: string
    first_ip: string
    last_ip: string
    address_count: string
    country?: string | null
    country_code?: string | null
    isp?: string | null
    org?: string | null
    asn?: string | null
    spillover: boolean
    other_isps: string[]
    samples: CidrSample[]
}

export interface Restriction {
    posting_blocked: boolean
    viewing_blocked: boolean
    reason?: string | null
    expires_at?: string | null
    scope?: string | null
    board_slug?: string | null
    kind?: string | null
}
