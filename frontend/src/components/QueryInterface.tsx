import { useState } from 'react';
import { api } from '../services/api';
import type { DocumentResponse, Citation, StreamEvent } from '../services/api';
import AnalysisResult from './AnalysisResult';
import './QueryInterface.css';

interface QueryInterfaceProps {
    documents: DocumentResponse[];
}

export interface StreamingHistoryItem {
    query: string;
    answer: string;
    citations: Citation[];
    documents_searched: number;
    timestamp: Date;
    isStreaming: boolean;
}

const Icon = {
    ArrowRight: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
        </svg>
    ),
    File: () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
        </svg>
    ),
    Search: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    ),
    Alert: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    ),
};

const EXAMPLES = [
    'What are the main obligations of the parties?',
    'Summarize the liability and indemnification clauses',
    'What are the termination conditions?',
    'Are there any confidentiality provisions?',
    'What are the payment terms and deadlines?',
    'How is the dispute resolution mechanism defined?',
];

function QueryInterface({ documents }: QueryInterfaceProps) {
    const [query, setQuery] = useState('');
    const [topK, setTopK] = useState(5);
    const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<StreamingHistoryItem[]>([]);

    const handleQuery = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError(null);

        const currentQuery = query;
        setQuery('');

        const newItem: StreamingHistoryItem = {
            query: currentQuery,
            answer: '',
            citations: [],
            documents_searched: 0,
            timestamp: new Date(),
            isStreaming: true,
        };
        setHistory(prev => [newItem, ...prev]);

        try {
            await api.runAgent(
                currentQuery,
                selectedDocs.length > 0 ? selectedDocs : undefined,
                topK,
                (event: StreamEvent) => {
                    switch (event.type) {
                        case 'meta':
                            setHistory(prev => {
                                const updated = [...prev];
                                updated[0] = { ...updated[0], documents_searched: event.documents_searched };
                                return updated;
                            });
                            break;
                        case 'chunk':
                            setHistory(prev => {
                                const updated = [...prev];
                                updated[0] = { ...updated[0], answer: updated[0].answer + event.content };
                                return updated;
                            });
                            break;
                        case 'citations':
                            setHistory(prev => {
                                const updated = [...prev];
                                updated[0] = { ...updated[0], citations: event.citations };
                                return updated;
                            });
                            break;
                        case 'done':
                            setHistory(prev => {
                                const updated = [...prev];
                                updated[0] = { ...updated[0], isStreaming: false };
                                return updated;
                            });
                            break;
                        case 'error':
                            setError(event.message);
                            setHistory(prev => {
                                const updated = [...prev];
                                updated[0] = { ...updated[0], isStreaming: false };
                                return updated;
                            });
                            break;
                    }
                },
            );
        } catch (err: any) {
            setError(err.message || 'Analysis failed');
            setHistory(prev => {
                if (prev.length > 0) {
                    const updated = [...prev];
                    updated[0] = { ...updated[0], isStreaming: false };
                    return updated;
                }
                return prev;
            });
        } finally {
            setLoading(false);
        }
    };

    const toggleDoc = (id: string) => {
        setSelectedDocs(prev =>
            prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
        );
    };

    return (
        <div className="query-page animate-in">
            <div className="upload-header">
                <p className="upload-eyebrow">Ask Lexicon</p>
                <h2 className="page-title">Ask anything about your documents.</h2>
                <p className="page-description">
                    Type a question. The agent retrieves the right passages and
                    streams a grounded answer with citations.
                </p>
            </div>

            {documents.length > 0 && (
                <div className="doc-selector">
                    <div className="selector-header">
                        <span className="selector-label">Search in</span>
                        <button
                            type="button"
                            className="selector-toggle"
                            onClick={() =>
                                setSelectedDocs(
                                    selectedDocs.length === documents.length
                                        ? []
                                        : documents.map(d => d.id)
                                )
                            }
                        >
                            {selectedDocs.length === documents.length
                                ? 'Deselect all'
                                : selectedDocs.length === 0
                                    ? 'All documents'
                                    : 'Select all'}
                        </button>
                    </div>
                    <div className="selector-chips">
                        {documents.map(doc => (
                            <button
                                key={doc.id}
                                type="button"
                                className={`selector-chip ${selectedDocs.includes(doc.id) ? 'selected' : ''}`}
                                onClick={() => toggleDoc(doc.id)}
                            >
                                <Icon.File />
                                <span className="chip-title">{doc.title}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <form className="query-form" onSubmit={handleQuery}>
                <textarea
                    className="query-input"
                    placeholder="Ask a question about your documents… e.g. What are the termination conditions in this contract?"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setError(null);
                    }}
                    disabled={loading}
                    rows={3}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleQuery(e);
                        }
                    }}
                />

                <div className="query-controls">
                    <div className="topk-control">
                        <label className="topk-label" htmlFor="topk-slider">
                            Top-k <span className="topk-value">{topK}</span>
                        </label>
                        <input
                            id="topk-slider"
                            type="range"
                            min="1"
                            max="15"
                            value={topK}
                            onChange={(e) => setTopK(parseInt(e.target.value))}
                            className="topk-slider"
                        />
                    </div>
                    <button
                        type="submit"
                        className="query-btn"
                        disabled={loading || !query.trim()}
                    >
                        {loading ? (
                            <>
                                <span className="spinner" />
                                Analyzing…
                            </>
                        ) : (
                            <>
                                Run agent
                                <Icon.ArrowRight />
                            </>
                        )}
                    </button>
                </div>
            </form>

            {error && (
                <div className="message message-error animate-scale">
                    <span className="message-icon"><Icon.Alert /></span>
                    <div>
                        <strong>{error}</strong>
                    </div>
                </div>
            )}

            <div className="query-results">
                {history.map((item, index) => (
                    <AnalysisResult key={index} item={item} />
                ))}
            </div>

            {history.length === 0 && !loading && (
                <div className="query-empty">
                    <div className="empty-icon"><Icon.Search /></div>
                    <h3>Try an example</h3>
                    <p>Pick a question to see how grounded answers look.</p>
                    <div className="example-list">
                        {EXAMPLES.map((example, i) => (
                            <button
                                key={i}
                                type="button"
                                className="example-chip"
                                onClick={() => setQuery(example)}
                            >
                                {example}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default QueryInterface;
