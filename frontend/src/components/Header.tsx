import './Header.css';

interface HeaderProps {
    onLogoClick?: () => void;
}

function Header({ onLogoClick }: HeaderProps) {
    return (
        <header className="header">
            <div className="header-left">
                <button
                    className="header-logo"
                    onClick={onLogoClick}
                    aria-label="Home"
                    type="button"
                >
                    <div className="logo-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 4h12l4 4v12H4Z" />
                            <path d="M16 4v4h4" />
                            <line x1="8" y1="13" x2="16" y2="13" />
                            <line x1="8" y1="16" x2="14" y2="16" />
                        </svg>
                    </div>
                    <div className="header-title-group">
                        <span className="header-title">Lexicon</span>
                        <span className="header-subtitle">Talk to your PDFs</span>
                    </div>
                </button>
            </div>
            <div className="header-right">
                <div className="header-badge">
                    <span className="badge-dot"></span>
                    <span className="badge-text">RAG · ChromaDB · GPT-4</span>
                </div>
            </div>
        </header>
    );
}

export default Header;
