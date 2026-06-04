import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { DocumentResponse } from '../services/api';
import './DocumentList.css';

interface DocumentListProps {
    onDocumentsLoaded: (docs: DocumentResponse[]) => void;
    onDocumentDeleted: (id: string) => void;
}

function DocumentList({ onDocumentsLoaded, onDocumentDeleted }: DocumentListProps) {
    const [documents, setDocuments] = useState<DocumentResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const fetchDocuments = async () => {
        try {
            setLoading(true);
            const response = await api.listDocuments();
            setDocuments(response.documents);
            onDocumentsLoaded(response.documents);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load documents');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, []);

    const handleDelete = async (id: string) => {
        setDeleting(id);
        try {
            await api.deleteDocument(id);
            setDocuments(prev => prev.filter(d => d.id !== id));
            onDocumentDeleted(id);
            setDeleteConfirm(null);
        } catch (err: any) {
            setError(err.message || 'Failed to delete document');
        } finally {
            setDeleting(null);
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (loading) {
        return (
            <div className="doclist-page animate-in">
                <div className="upload-header">
                    <h2 className="page-title">My Documents</h2>
                    <p className="page-description">Loading your documents...</p>
                </div>
                <div className="doclist-skeleton">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="doc-card-skeleton glass">
                            <div className="skeleton-line wide"></div>
                            <div className="skeleton-line medium"></div>
                            <div className="skeleton-line narrow"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="doclist-page animate-in">
            <div className="upload-header">
                <h2 className="page-title">My Documents</h2>
                <p className="page-description">
                    {documents.length > 0
                        ? `${documents.length} document${documents.length > 1 ? 's' : ''} uploaded and indexed for analysis`
                        : 'No documents uploaded yet. Go to Upload to add your first document.'}
                </p>
            </div>

            {error && (
                <div className="upload-message error animate-scale">
                    <span className="message-icon">❌</span>
                    <div>
                        <strong>Error</strong>
                        <p>{error}</p>
                    </div>
                </div>
            )}

            {documents.length > 0 ? (
                <div className="doclist-grid">
                    {documents.map((doc, index) => (
                        <div
                            key={doc.id}
                            className="doc-card glass"
                            style={{ animationDelay: `${index * 0.05}s` }}
                        >
                            <div className="doc-card-header">
                                <div className="doc-icon">📄</div>
                                <div className="doc-card-actions">
                                    {deleteConfirm === doc.id ? (
                                        <div className="delete-confirm">
                                            <button
                                                className="confirm-yes"
                                                onClick={() => handleDelete(doc.id)}
                                                disabled={deleting === doc.id}
                                            >
                                                {deleting === doc.id ? '...' : '✓'}
                                            </button>
                                            <button
                                                className="confirm-no"
                                                onClick={() => setDeleteConfirm(null)}
                                            >
                                                ✗
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            className="doc-delete-btn"
                                            onClick={() => setDeleteConfirm(doc.id)}
                                            title="Delete document"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                </div>
                            </div>

                            <h3 className="doc-title">{doc.title}</h3>

                            <div className="doc-meta">
                                <div className="doc-meta-item">
                                    <span className="meta-label">Pages</span>
                                    <span className="meta-value">{doc.page_count}</span>
                                </div>
                                <div className="doc-meta-item">
                                    <span className="meta-label">Chunks</span>
                                    <span className="meta-value">{doc.chunk_count}</span>
                                </div>
                            </div>

                            <div className="doc-footer">
                                <span className="doc-date">{formatDate(doc.created_at)}</span>
                                <span className="doc-id">ID: {doc.id}</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="empty-state glass">
                    <div className="empty-icon">📁</div>
                    <h3>No Documents Yet</h3>
                    <p>Upload your first legal document to get started with AI analysis</p>
                </div>
            )}
        </div>
    );
}

export default DocumentList;
