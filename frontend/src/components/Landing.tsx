import './Landing.css';

interface LandingProps {
    onStart: () => void;
    onDemo: () => void;
}

const STEPS = [
    {
        n: '1',
        title: 'Upload',
        body: 'Drop a PDF. We chunk it and index it in ChromaDB.',
    },
    {
        n: '2',
        title: 'Ask',
        body: 'Type a question. We retrieve the most relevant chunks.',
    },
    {
        n: '3',
        title: 'Get an answer',
        body: 'GPT-4 grounds its reply in your document with page citations.',
    },
];

const FEATURES = [
    'Recursive chunking with overlap',
    'OpenAI text-embedding-3 in ChromaDB',
    'Top-k similarity + per-doc filter',
    'Streamed token-by-token answers',
];

function Landing({ onStart, onDemo }: LandingProps) {
    return (
        <div className="landing">
            <p className="landing-eyebrow">
                Retrieval-augmented PDF assistant
            </p>

            <h1 className="landing-title">
                Talk to your PDFs.
            </h1>

            <p className="landing-sub">
                Upload a document, ask anything. Lexicon retrieves the right
                passages and streams an answer that cites the page.
            </p>

            <div className="landing-cta-row">
                <button className="landing-cta primary" onClick={onStart}>
                    Upload a document
                </button>
                <button className="landing-cta ghost" onClick={onDemo}>
                    Try with a sample
                </button>
            </div>

            <div className="landing-section">
                <p className="landing-section-label">How it works</p>
                <ol className="landing-steps">
                    {STEPS.map((s) => (
                        <li className="landing-step" key={s.n}>
                            <span className="step-n">{s.n}</span>
                            <div>
                                <h3 className="step-title">{s.title}</h3>
                                <p className="step-body">{s.body}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </div>

            <div className="landing-section">
                <p className="landing-section-label">Under the hood</p>
                <ul className="feature-list">
                    {FEATURES.map((f) => (
                        <li className="feature-item" key={f}>
                            <span className="feature-check" aria-hidden>✓</span>
                            {f}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default Landing;
