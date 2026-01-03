// User types
export interface User {
  id: string;
  email: string;
  created_at: string;
  subscription_tier: string;
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthResponse {
  user: User;
  tokens: TokenResponse;
}

// Note types
export interface Note {
  id: string;
  content: string;
  content_type: string;
  source: string | null;
  source_url: string | null;
  tags: string[];
  entities: string[];
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  connection_count: number;
}

export interface NoteCreate {
  content: string;
  source?: string;
  source_url?: string;
  tags?: string[];
  context?: Record<string, unknown>;
}

export interface CaptureResult {
  note_id: string;
  tags: string[];
  entities: string[];
  connections: Array<{
    preview: string;
    strength: number;
    note_id: string;
  }>;
  message: string;
}

// Search types
export interface SearchFilters {
  tags?: string[];
  date_after?: string;
  date_before?: string;
  project?: string;
  source?: string;
}

export interface SearchQuery {
  query: string;
  filters?: SearchFilters;
  top_k?: number;
}

export interface SearchResultItem {
  note_id: string;
  content: string;
  score: number;
  tags: string[];
  source: string | null;
  created_at: string;
  preview: string;
}

export interface SearchResult {
  query: string;
  total_results: number;
  results: SearchResultItem[];
  filters_applied: SearchFilters | null;
}

// Chat types
export interface ChatMessage {
  message: string;
  conversation_id?: string;
}

export interface ChatResponse {
  response: string;
  conversation_id: string;
  sources_used: Array<{
    content: string;
    note_id: string;
  }>;
  tool_calls: string[];
}

// Review types
export interface ReviewDue {
  note_id: string;
  content_preview: string;
  tags: string[];
  last_reviewed_at: string | null;
  review_count: number;
  ease_factor: number;
}

export interface ReviewListResponse {
  due_count: number;
  reviews: ReviewDue[];
}

export interface ReviewStats {
  total_reviews: number;
  due_today: number;
  current_streak: number;
  average_ease_factor: number;
}

// API Error
export interface ApiError {
  detail: string;
}
