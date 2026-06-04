import { useState } from 'react';
import type { Citation } from '../services/api';
import type { StreamingHistoryItem } from './QueryInterface';
import './AnalysisResult.css';

// Simple inline markdown -> HTML helper
function inlineMd(text: string): string {
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

interface AnalysisResultProps {
    item: StreamingHistoryItem;
}

function AnalysisResult({ item }: AnalysisResultProps) {
    const [showCitations, setShowCitations] = useState(true);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    const copyToClipboard = (text: string, index: number) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
        });
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getScoreColor = (score: number) => {
        if (score >= 0.8) return 'score-high';
        if (score >= 0.5) return 'score-medium';
        return 'score-low';
    };

    return (
        <div className="result-block animate-in">
            {/* Query header */}
            <div className="result-query">
                <div className="query-bubble">
                    <span className="query-avatar">👤</span>
                    <div className="query-text">
                        <p>{item.query}</p>
                        <span className="query-time">{formatTime(item.timestamp)}</span>
                    </div>
                </div>
            </div>

            {/* AI Response */}
            <div className="result-answer">
                <div className="answer-header">
                    <span className="answer-avatar">🧠</span>
                    <span className="answer-label">LegalMind AI Agent</span>
                    <span className="answer-meta">
                        {item.documents_searched > 0 && (
                            <>
                                {item.documents_searched} documents searched
                                {!item.isStreaming && ` · ${item.citations.length} citation${item.citations.length !== 1 ? 's' : ''}`}
                            </>
                        )}
                        {item.isStreaming && (
                            <span className="streaming-badge">
                                <span className="streaming-dot"></span>
                                Streaming...
                            </span>
                        )}
                    </span>
                </div>

                <div className="answer-body">
                    <div className={`answer-text ${item.isStreaming ? 'streaming' : ''}`}>
                        {item.answer ? (
                            item.answer.split('\n').map((line, i) => {
                                // Headings (### or ##)
                                const h3Match = line.match(/^#{2,3}\s+(.*)/);
                                if (h3Match) {
                                    return <h3 key={i} className="answer-heading">{h3Match[1].replace(/\*\*/g, '')}</h3>;
                                }
                                // Bold-only lines
                                if (/^\*\*.+\*\*$/.test(line.trim())) {
                                    return <h3 key={i} className="answer-heading">{line.replace(/\*\*/g, '')}</h3>;
                                }
                                // List items
                                if (/^[-*]\s+/.test(line)) {
                                    const content = line.replace(/^[-*]\s+/, '');
                                    return (
                                        <li key={i} className="answer-list-item"
                                            dangerouslySetInnerHTML={{ __html: inlineMd(content) }}
                                        />
                                    );
                                }
                                // Numbered list items
                                if (/^\d+\.\s+/.test(line)) {
                                    const content = line.replace(/^\d+\.\s+/, '');
                                    return (
                                        <li key={i} className="answer-list-item ordered"
                                            dangerouslySetInnerHTML={{ __html: inlineMd(content) }}
                                        />
                                    );
                                }
                                // Empty lines
                                if (line.trim() === '') return <br key={i} />;
                                // Normal paragraph
                                return (
                                    <p key={i}
                                        dangerouslySetInnerHTML={{ __html: inlineMd(line) }}
                                    />
                                );
                            })
                        ) : item.isStreaming ? (
                            <div className="streaming-placeholder">
                                <span className="streaming-cursor"></span>
                                <span className="streaming-text">Agent is analyzing...</span>
                            </div>
                        ) : null}
                        {item.isStreaming && item.answer && (
                            <span className="streaming-cursor inline"></span>
                        )}
                    </div>

                    {!item.isStreaming && item.answer && (
                        <button
                            className="copy-answer-btn"
                            onClick={() => copyToClipboard(item.answer, -1)}
                        >
                            {copiedIndex === -1 ? '✅ Copied!' : '📋 Copy Analysis'}
                        </button>
                    )}
                </div>
            </div>

            {/* Citations */}
            {!item.isStreaming && item.citations.length > 0 && (
                <div className="result-citations">
                    <button
                        className="citations-toggle"
                        onClick={() => setShowCitations(!showCitations)}
                    >
                        <span>📎 Citations ({item.citations.length})</span>
                        <span className={`toggle-arrow ${showCitations ? 'open' : ''}`}>
                            ▼
                        </span>
                    </button>

                    {showCitations && (
                        <div className="citations-list">
                            {item.citations.map((citation: Citation, i: number) => (
                                <div
                                    key={i}
                                    className="citation-card"
                                    style={{ animationDelay: `${i * 0.05}s` }}
                                >
                                    <div className="citation-header">
                                        <div className="citation-source">
                                            <span className="citation-doc">📄 {citation.document_title}</span>
                                            <span className="citation-page">Page {citation.page}</span>
                                        </div>
                                        <div className={`citation-score ${getScoreColor(citation.relevance_score)}`}>
                                            {(citation.relevance_score * 100).toFixed(0)}%
                                        </div>
                                    </div>
                                    <p className="citation-text">{citation.text}</p>
                                    <button
                                        className="citation-copy"
                                        onClick={() => copyToClipboard(citation.text, i)}
                                    >
                                        {copiedIndex === i ? '✅' : '📋'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default AnalysisResult;
