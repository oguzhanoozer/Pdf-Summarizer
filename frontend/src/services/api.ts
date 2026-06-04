const API_BASE = '/api';

export interface DocumentResponse {
    id: string;
    title: string;
    filename: string;
    page_count: number;
    chunk_count: number;
    created_at: string;
}

export interface DocumentListResponse {
    documents: DocumentResponse[];
    total: number;
}

export interface Citation {
    text: string;
    page: number;
    document_title: string;
    document_id: string;
    relevance_score: number;
}

export interface QueryResponse {
    answer: string;
    citations: Citation[];
    query: string;
    documents_searched: number;
}

export interface SearchResult {
    text: string;
    page: number;
    document_title: string;
    document_id: string;
    score: number;
}

export interface SearchResponse {
    results: SearchResult[];
    query: string;
}

export interface HealthResponse {
    status: string;
    version: string;
    chroma_status: string;
    document_count: number;
    embedding_model: string;
}

// SSE streaming event types
export interface StreamChunkEvent {
    type: 'chunk';
    content: string;
}
export interface StreamMetaEvent {
    type: 'meta';
    documents_searched: number;
    chunks_found: number;
}
export interface StreamCitationsEvent {
    type: 'citations';
    citations: Citation[];
}
export interface StreamDoneEvent {
    type: 'done';
}
export interface StreamErrorEvent {
    type: 'error';
    message: string;
}
export type StreamEvent =
    | StreamChunkEvent
    | StreamMetaEvent
    | StreamCitationsEvent
    | StreamDoneEvent
    | StreamErrorEvent;

class ApiService {
    private baseUrl: string;
    private defaultTimeout: number;

    constructor(baseUrl: string = API_BASE, defaultTimeout = 120_000) {
        this.baseUrl = baseUrl;
        this.defaultTimeout = defaultTimeout;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {},
        timeout?: number,
    ): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const controller = new AbortController();
        const ms = timeout ?? this.defaultTimeout;
        const timer = setTimeout(() => controller.abort(), ms);

        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                signal: controller.signal,
                ...options,
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({
                    detail: response.statusText,
                }));
                throw new Error(error.detail || `HTTP ${response.status}`);
            }

            return response.json();
        } catch (err: any) {
            if (err.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    // ----------------------------------------------------------------
    // Create Knowledge Base (PDF via URL)
    // ----------------------------------------------------------------
    async createKnowledgeBase(
        url: string,
        title?: string,
    ): Promise<DocumentResponse> {
        return this.request<DocumentResponse>('/create-knowledge-base', {
            method: 'POST',
            body: JSON.stringify({ url, title: title || undefined }),
        });
    }

    // ----------------------------------------------------------------
    // Documents (file upload — kept for backward compat)
    // ----------------------------------------------------------------
    async uploadDocument(
        file: File,
        title?: string,
        onProgress?: (pct: number) => void,
    ): Promise<DocumentResponse> {
        const formData = new FormData();
        formData.append('file', file);
        if (title) {
            formData.append('title', title);
        }

        // Use XMLHttpRequest for upload progress
        if (onProgress) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${this.baseUrl}/documents/upload`);
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
                };
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(JSON.parse(xhr.responseText));
                    } else {
                        try {
                            const err = JSON.parse(xhr.responseText);
                            reject(new Error(err.detail || `HTTP ${xhr.status}`));
                        } catch {
                            reject(new Error(`HTTP ${xhr.status}`));
                        }
                    }
                };
                xhr.onerror = () => reject(new Error('Network error'));
                xhr.timeout = 180_000;
                xhr.ontimeout = () => reject(new Error('Upload timed out'));
                xhr.send(formData);
            });
        }

        const url = `${this.baseUrl}/documents/upload`;
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({
                detail: response.statusText,
            }));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        return response.json();
    }

    async listDocuments(): Promise<DocumentListResponse> {
        return this.request<DocumentListResponse>('/documents');
    }

    async getDocument(id: string): Promise<DocumentResponse> {
        return this.request<DocumentResponse>(`/documents/${id}`);
    }

    async deleteDocument(id: string): Promise<void> {
        await this.request(`/documents/${id}`, { method: 'DELETE' });
    }

    // ----------------------------------------------------------------
    // Run Agent (streaming SSE)
    // ----------------------------------------------------------------
    async runAgent(
        query: string,
        documentIds?: string[],
        topK: number = 5,
        onEvent?: (event: StreamEvent) => void,
    ): Promise<void> {
        const url = `${this.baseUrl}/run-agent`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 180_000);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query,
                    document_ids: documentIds,
                    top_k: topK,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({
                    detail: response.statusText,
                }));
                throw new Error(error.detail || `HTTP ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE lines
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('data: ')) {
                        const jsonStr = trimmed.slice(6);
                        try {
                            const event: StreamEvent = JSON.parse(jsonStr);
                            onEvent?.(event);
                        } catch {
                            // ignore malformed lines
                        }
                    }
                }
            }

            // Process remaining buffer
            if (buffer.trim().startsWith('data: ')) {
                try {
                    const event: StreamEvent = JSON.parse(buffer.trim().slice(6));
                    onEvent?.(event);
                } catch {
                    // ignore
                }
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    // ----------------------------------------------------------------
    // Legacy Query (non-streaming — kept for backward compat)
    // ----------------------------------------------------------------
    async queryDocuments(
        query: string,
        documentIds?: string[],
        topK: number = 5
    ): Promise<QueryResponse> {
        return this.request<QueryResponse>('/query', {
            method: 'POST',
            body: JSON.stringify({
                query,
                document_ids: documentIds,
                top_k: topK,
            }),
        });
    }

    async searchDocuments(
        query: string,
        documentIds?: string[],
        topK: number = 5
    ): Promise<SearchResponse> {
        return this.request<SearchResponse>('/query/search', {
            method: 'POST',
            body: JSON.stringify({
                query,
                document_ids: documentIds,
                top_k: topK,
            }),
        });
    }

    // Health
    async healthCheck(): Promise<HealthResponse> {
        return this.request<HealthResponse>('/health');
    }
}

export const api = new ApiService();
