import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  Note,
  NoteCreate,
  CaptureResult,
  SearchQuery,
  SearchResult,
  ChatMessage,
  ChatResponse,
  ReviewListResponse,
  ReviewStats,
  ApiError,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Load token from localStorage
    this.accessToken = localStorage.getItem('access_token');

    // Request interceptor to add auth header
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        if (error.response?.status === 401) {
          // Token expired, try to refresh
          const refreshToken = localStorage.getItem('refresh_token');
          if (refreshToken) {
            try {
              const response = await this.refreshToken(refreshToken);
              this.setTokens(response.access_token, response.refresh_token);

              // Retry the original request
              if (error.config) {
                error.config.headers.Authorization = `Bearer ${response.access_token}`;
                return this.client.request(error.config);
              }
            } catch {
              // Refresh failed, clear tokens and redirect to login
              this.clearTokens();
              window.location.href = '/login';
            }
          } else {
            this.clearTokens();
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  }

  clearTokens() {
    this.accessToken = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  // Auth endpoints
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/api/v1/auth/register', data);
    this.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
    return response.data;
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/api/v1/auth/login', data);
    this.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
    return response.data;
  }

  async refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    const response = await this.client.post('/api/v1/auth/refresh', { refresh_token: refreshToken });
    return response.data;
  }

  async getCurrentUser(): Promise<AuthResponse['user']> {
    const response = await this.client.get('/api/v1/auth/me');
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/api/v1/auth/logout');
    } finally {
      this.clearTokens();
    }
  }

  // Notes endpoints
  async createNote(data: NoteCreate): Promise<CaptureResult> {
    const response = await this.client.post<CaptureResult>('/api/v1/notes', data);
    return response.data;
  }

  async getNotes(limit = 20, offset = 0, tags?: string[]): Promise<{ notes: Note[]; total: number }> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (tags?.length) {
      tags.forEach(tag => params.append('tags', tag));
    }
    const response = await this.client.get(`/api/v1/notes?${params}`);
    return response.data;
  }

  async getNote(noteId: string): Promise<Note> {
    const response = await this.client.get<Note>(`/api/v1/notes/${noteId}`);
    return response.data;
  }

  async deleteNote(noteId: string): Promise<void> {
    await this.client.delete(`/api/v1/notes/${noteId}`);
  }

  // Search endpoints
  async search(query: SearchQuery): Promise<SearchResult> {
    const response = await this.client.post<SearchResult>('/api/v1/search', query);
    return response.data;
  }

  // Chat endpoints
  async chat(data: ChatMessage): Promise<ChatResponse> {
    const response = await this.client.post<ChatResponse>('/api/v1/chat', data);
    return response.data;
  }

  // Review endpoints
  async getDueReviews(limit = 10): Promise<ReviewListResponse> {
    const response = await this.client.get<ReviewListResponse>(`/api/v1/reviews/due?limit=${limit}`);
    return response.data;
  }

  async submitReview(noteId: string, rating: number): Promise<{ interval_days: number }> {
    const response = await this.client.post(`/api/v1/reviews/${noteId}`, { rating });
    return response.data;
  }

  async getReviewStats(): Promise<ReviewStats> {
    const response = await this.client.get<ReviewStats>('/api/v1/reviews/stats');
    return response.data;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; postgres: string; qdrant: string; redis: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const api = new ApiClient();
export default api;
