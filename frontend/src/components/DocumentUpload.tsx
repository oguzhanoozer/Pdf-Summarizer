import { useState, useRef } from 'react';
import { api } from '../services/api';
import type { DocumentResponse } from '../services/api';
import './DocumentUpload.css';

interface DocumentUploadProps {
    onDocumentUploaded: (doc: DocumentResponse) => void;
}

type UploadMode = 'url' | 'file';

// — Inline icons —
const Icon = {
    Link: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
    ),
    Upload: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
    ),
    File: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
        </svg>
    ),
    Title: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
    ),
    Close: () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    ),
    Check: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    ),
    Alert: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    ),
    ArrowRight: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
        </svg>
    ),
    Cube: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
    ),
    Search: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    ),
    Zap: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
    ),
};

function DocumentUpload({ onDocumentUploaded }: DocumentUploadProps) {
    const [mode, setMode] = useState<UploadMode>('url');
    const [pdfUrl, setPdfUrl] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<DocumentResponse | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = (selectedFile: File) => {
        setError(null);
        setSuccess(null);
        if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
            setError('Only PDF files are supported');
            return;
        }
        setFile(selectedFile);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(true);
    };

    const handleDragLeave = () => setDragActive(false);

    const handleSubmitUrl = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pdfUrl.trim()) {
            setError('Please enter a PDF URL');
            return;
        }
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
            const doc = await api.createKnowledgeBase(pdfUrl, title || undefined);
            setSuccess(doc);
            onDocumentUploaded(doc);
            setPdfUrl('');
            setTitle('');
        } catch (err: any) {
            setError(err.message || 'Failed to create knowledge base');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitFile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError('Please select a PDF file');
            return;
        }
        setLoading(true);
        setError(null);
        setSuccess(null);
        setUploadProgress(0);
        try {
            const doc = await api.uploadDocument(file, title || undefined, (pct) => {
                setUploadProgress(pct);
            });
            setSuccess(doc);
            onDocumentUploaded(doc);
            setFile(null);
            setTitle('');
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err: any) {
            setError(err.message || 'Failed to upload file');
        } finally {
            setLoading(false);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className="upload-page animate-in">
            <div className="upload-header">
                <p className="upload-eyebrow">Index a document</p>
                <h2 className="page-title">Add a PDF to the knowledge base.</h2>
                <p className="page-description">
                    Drop a file or paste a URL. Lexicon extracts the text, chunks it,
                    and stores embeddings in ChromaDB.
                </p>
            </div>

            <div className="upload-card">
                <div className="upload-tabs">
                    <button
                        className={`upload-tab ${mode === 'url' ? 'active' : ''}`}
                        onClick={() => { setMode('url'); setError(null); setSuccess(null); }}
                        type="button"
                    >
                        <Icon.Link />
                        From URL
                    </button>
                    <button
                        className={`upload-tab ${mode === 'file' ? 'active' : ''}`}
                        onClick={() => { setMode('file'); setError(null); setSuccess(null); }}
                        type="button"
                    >
                        <Icon.Upload />
                        Upload file
                    </button>
                </div>

                {mode === 'url' && (
                    <form className="upload-form" onSubmit={handleSubmitUrl}>
                        <div className="field">
                            <label className="field-label" htmlFor="pdf-url">PDF URL</label>
                            <div className="input-wrapper">
                                <span className="input-icon"><Icon.Link /></span>
                                <input
                                    id="pdf-url"
                                    type="url"
                                    className="input"
                                    placeholder="https://example.com/document.pdf"
                                    value={pdfUrl}
                                    onChange={(e) => { setPdfUrl(e.target.value); setError(null); }}
                                    disabled={loading}
                                    autoFocus
                                />
                                {pdfUrl && (
                                    <button
                                        type="button"
                                        className="input-clear"
                                        onClick={() => setPdfUrl('')}
                                        aria-label="Clear URL"
                                    >
                                        <Icon.Close />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="field">
                            <label className="field-label" htmlFor="doc-title">
                                Title <span className="field-optional">— optional</span>
                            </label>
                            <div className="input-wrapper">
                                <span className="input-icon"><Icon.Title /></span>
                                <input
                                    id="doc-title"
                                    type="text"
                                    className="input"
                                    placeholder="Auto-generated from URL if blank"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    disabled={loading}
                                />
                                {title && (
                                    <button
                                        type="button"
                                        className="input-clear"
                                        onClick={() => setTitle('')}
                                        aria-label="Clear title"
                                    >
                                        <Icon.Close />
                                    </button>
                                )}
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="upload-btn"
                            disabled={loading || !pdfUrl.trim()}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner" />
                                    Indexing…
                                </>
                            ) : (
                                <>
                                    Index document
                                    <Icon.ArrowRight />
                                </>
                            )}
                        </button>
                    </form>
                )}

                {mode === 'file' && (
                    <form className="upload-form" onSubmit={handleSubmitFile}>
                        <div
                            className={`drop-zone ${dragActive ? 'active' : ''} ${file ? 'has-file' : ''}`}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => fileInputRef.current?.click()}
                            role="button"
                            tabIndex={0}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf"
                                className="file-input-hidden"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        handleFile(e.target.files[0]);
                                    }
                                }}
                                disabled={loading}
                            />
                            {file ? (
                                <div className="file-preview">
                                    <span className="file-preview-icon"><Icon.File /></span>
                                    <div className="file-info">
                                        <span className="file-name">{file.name}</span>
                                        <span className="file-size">{formatFileSize(file.size)}</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="file-remove"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setFile(null);
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }}
                                        aria-label="Remove file"
                                    >
                                        <Icon.Close />
                                    </button>
                                </div>
                            ) : (
                                <div className="drop-content">
                                    <span className="drop-icon"><Icon.Upload /></span>
                                    <p className="drop-text">
                                        Drop a PDF here, or <span className="drop-link">browse</span>
                                    </p>
                                    <p className="drop-hint">PDF only · up to 25 MB</p>
                                </div>
                            )}
                        </div>

                        <div className="field">
                            <label className="field-label" htmlFor="doc-title-file">
                                Title <span className="field-optional">— optional</span>
                            </label>
                            <div className="input-wrapper">
                                <span className="input-icon"><Icon.Title /></span>
                                <input
                                    id="doc-title-file"
                                    type="text"
                                    className="input"
                                    placeholder="Auto-generated from filename if blank"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    disabled={loading}
                                />
                                {title && (
                                    <button
                                        type="button"
                                        className="input-clear"
                                        onClick={() => setTitle('')}
                                        aria-label="Clear title"
                                    >
                                        <Icon.Close />
                                    </button>
                                )}
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="upload-btn"
                            disabled={loading || !file}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner" />
                                    {uploadProgress > 0 && uploadProgress < 100
                                        ? `Uploading ${uploadProgress}%`
                                        : 'Processing…'}
                                </>
                            ) : (
                                <>
                                    Upload &amp; index
                                    <Icon.ArrowRight />
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>

            {error && (
                <div className="message message-error animate-scale">
                    <span className="message-icon"><Icon.Alert /></span>
                    <div>
                        <strong>{error}</strong>
                    </div>
                </div>
            )}

            {success && (
                <div className="message message-success animate-scale">
                    <span className="message-icon"><Icon.Check /></span>
                    <div>
                        <strong>Indexed.</strong>
                        <div className="success-details">
                            <span>{success.title}</span>
                            <span className="dot" />
                            <span>{success.page_count} pages</span>
                            <span className="dot" />
                            <span>{success.chunk_count} chunks</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="upload-features">
                <div className="feature-card">
                    <div className="feature-icon"><Icon.Cube /></div>
                    <h3>Smart chunking</h3>
                    <p>Recursive splitter with overlap keeps semantically related text together.</p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon"><Icon.Search /></div>
                    <h3>Vector search</h3>
                    <p>OpenAI embeddings in ChromaDB. Top-k similarity with per-document filter.</p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon"><Icon.Zap /></div>
                    <h3>Streamed answers</h3>
                    <p>GPT-4 streams its reply token by token, grounded in the retrieved chunks.</p>
                </div>
            </div>
        </div>
    );
}

export default DocumentUpload;
