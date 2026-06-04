import { useState } from 'react';
import './App.css';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Landing from './components/Landing';
import DocumentUpload from './components/DocumentUpload';
import DocumentList from './components/DocumentList';
import QueryInterface from './components/QueryInterface';
import type { DocumentResponse } from './services/api';

export type ViewType = 'landing' | 'upload' | 'documents' | 'query';

function App() {
  const [activeView, setActiveView] = useState<ViewType>('landing');
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleDocumentUploaded = (doc: DocumentResponse) => {
    setDocuments(prev => [doc, ...prev]);
    setRefreshKey(k => k + 1);
  };

  const handleDocumentsLoaded = (docs: DocumentResponse[]) => {
    setDocuments(docs);
  };

  const handleDocumentDeleted = (id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
    setRefreshKey(k => k + 1);
  };

  const renderView = () => {
    switch (activeView) {
      case 'landing':
        return (
          <Landing
            onStart={() => setActiveView('upload')}
            onDemo={() => setActiveView('query')}
          />
        );
      case 'upload':
        return (
          <DocumentUpload onDocumentUploaded={handleDocumentUploaded} />
        );
      case 'documents':
        return (
          <DocumentList
            key={refreshKey}
            onDocumentsLoaded={handleDocumentsLoaded}
            onDocumentDeleted={handleDocumentDeleted}
          />
        );
      case 'query':
        return (
          <QueryInterface documents={documents} />
        );
      default:
        return <Landing onStart={() => setActiveView('upload')} onDemo={() => setActiveView('query')} />;
    }
  };

  const isLanding = activeView === 'landing';

  return (
    <div className="app">
      <Header onLogoClick={() => setActiveView('landing')} />
      <div className="app-body">
        {!isLanding && (
          <Sidebar
            activeView={activeView}
            onViewChange={setActiveView}
            documentCount={documents.length}
          />
        )}
        <main className={`main-content ${isLanding ? 'main-content-landing' : ''}`}>
          {renderView()}
        </main>
      </div>
    </div>
  );
}

export default App;
