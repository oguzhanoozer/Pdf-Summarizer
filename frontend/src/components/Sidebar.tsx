import type { ViewType } from '../App';
import './Sidebar.css';

interface SidebarProps {
    activeView: ViewType;
    onViewChange: (view: ViewType) => void;
    documentCount: number;
}

const navItems: { id: ViewType; label: string; icon: string }[] = [
    { id: 'upload', label: 'Index a document', icon: '⊕' },
    { id: 'documents', label: 'Library', icon: '⌘' },
    { id: 'query', label: 'Ask Lexicon', icon: '✦' },
];

function Sidebar({ activeView, onViewChange, documentCount }: SidebarProps) {
    return (
        <aside className="sidebar">
            <nav className="sidebar-nav">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        className={`sidebar-item ${activeView === item.id ? 'active' : ''}`}
                        onClick={() => onViewChange(item.id)}
                    >
                        <span className="sidebar-item-icon">{item.icon}</span>
                        <span className="sidebar-item-label">{item.label}</span>
                        {item.id === 'documents' && documentCount > 0 && (
                            <span className="sidebar-badge">{documentCount}</span>
                        )}
                        {activeView === item.id && (
                            <span className="sidebar-indicator" />
                        )}
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-info">
                    <div className="sidebar-info-icon">⌖</div>
                    <div className="sidebar-info-text">
                        <span className="sidebar-info-title">Retrieval-augmented</span>
                        <span className="sidebar-info-desc">
                            Chunks · Embeddings · ChromaDB · Streamed answers
                        </span>
                    </div>
                </div>
            </div>
        </aside>
    );
}

export default Sidebar;
