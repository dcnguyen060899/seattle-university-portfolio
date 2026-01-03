import { useState, useEffect } from 'react';
import { Brain, Search, Cpu, Database, Zap, GitBranch, Clock, ChevronRight, ExternalLink, Github } from 'lucide-react';

interface PipelineStep {
  step_name: string;
  description: string;
  duration_ms: number;
  data?: Record<string, unknown>;
}

interface RetrievedChunk {
  content: string;
  similarity_score: number;
  tags: string[];
  source: string;
  chunk_id: string;
}

interface RAGResponse {
  query: string;
  answer: string;
  pipeline_steps: PipelineStep[];
  retrieved_chunks: RetrievedChunk[];
  total_duration_ms: number;
  embedding_dimension: number;
  model_used: string;
}

interface SystemMetrics {
  total_knowledge_items: number;
  total_embeddings: number;
  total_connections: number;
  embedding_dimension: number;
  vector_db: string;
  llm_model: string;
  avg_query_time_ms: number;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const SAMPLE_QUERIES = [
  "What are Duy's main technical skills?",
  "Tell me about the Second Brain project",
  "What machine learning experience does Duy have?",
  "What kind of roles is Duy looking for?",
];

export default function Demo() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<RAGResponse | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch system metrics on load
    fetch(`${API_URL}/api/v1/demo/metrics`)
      .then(res => res.json())
      .then(data => setMetrics(data))
      .catch(err => console.error('Failed to fetch metrics:', err));

    // Seed demo data
    fetch(`${API_URL}/api/v1/demo/seed`, { method: 'POST' })
      .catch(err => console.error('Seed error:', err));
  }, []);

  const runPipeline = async (q: string) => {
    setQuery(q);
    setIsLoading(true);
    setError(null);
    setResponse(null);
    setActiveStep(0);

    try {
      const res = await fetch(`${API_URL}/api/v1/demo/rag-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, show_internals: true }),
      });

      if (!res.ok) throw new Error('Pipeline request failed');

      const data: RAGResponse = await res.json();
      setResponse(data);

      // Animate through steps
      for (let i = 0; i < data.pipeline_steps.length; i++) {
        setActiveStep(i);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      setActiveStep(null);
    } catch (err) {
      setError('Failed to run pipeline. Make sure the backend is running.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      runPipeline(query.trim());
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMjIiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />

        <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 relative">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl mb-6 shadow-lg shadow-violet-500/30">
              <Brain className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Second Brain
            </h1>
            <p className="text-xl text-violet-200 mb-2">
              AI Architecture Showcase
            </p>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Explore the RAG (Retrieval-Augmented Generation) pipeline in action.
              See how modern AI systems retrieve and synthesize information.
            </p>

            <div className="flex items-center justify-center gap-4 mt-6">
              <a
                href="https://github.com/dcnguyen060899"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                <Github className="w-4 h-4" />
                GitHub
              </a>
              <a
                href="https://duyng-portfolio.com/docs/index_portfolio.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Full Portfolio
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* System Metrics */}
      {metrics && (
        <section className="max-w-7xl mx-auto px-4 -mt-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Knowledge Items', value: metrics.total_knowledge_items, icon: Database },
              { label: 'Embedding Dims', value: metrics.embedding_dimension, icon: Cpu },
              { label: 'Connections', value: metrics.total_connections, icon: GitBranch },
              { label: 'Avg Query Time', value: `${metrics.avg_query_time_ms}ms`, icon: Clock },
            ].map((metric) => (
              <div key={metric.label} className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-4">
                <div className="flex items-center gap-2 text-violet-400 mb-1">
                  <metric.icon className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wide">{metric.label}</span>
                </div>
                <div className="text-2xl font-bold text-white">{metric.value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Demo Area */}
      <main className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Query Input */}
          <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Search className="w-5 h-5 text-violet-400" />
                Try the RAG Pipeline
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask anything about Duy's background, skills, or projects..."
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !query.trim()}
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Running Pipeline...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Run RAG Pipeline
                    </>
                  )}
                </button>
              </form>

              {/* Sample Queries */}
              <div className="mt-4">
                <p className="text-xs text-slate-500 mb-2">Try these:</p>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_QUERIES.map((sq) => (
                    <button
                      key={sq}
                      onClick={() => runPipeline(sq)}
                      disabled={isLoading}
                      className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                    >
                      {sq}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300">
                {error}
              </div>
            )}

            {/* Answer Display */}
            {response && (
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
                <h3 className="text-sm font-medium text-violet-400 mb-2">AI Response</h3>
                <p className="text-white whitespace-pre-wrap">{response.answer}</p>
                <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between text-xs text-slate-500">
                  <span>Model: {response.model_used}</span>
                  <span>Total: {response.total_duration_ms}ms</span>
                </div>
              </div>
            )}
          </div>

          {/* Pipeline Visualization */}
          <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-violet-400" />
                RAG Pipeline Steps
              </h2>

              <div className="space-y-4">
                {(response?.pipeline_steps || [
                  { step_name: 'Query Embedding', description: 'Convert query to vector', duration_ms: 0 },
                  { step_name: 'Vector Search', description: 'Find similar chunks in Qdrant', duration_ms: 0 },
                  { step_name: 'Context Assembly', description: 'Prepare context from chunks', duration_ms: 0 },
                  { step_name: 'LLM Generation', description: 'Generate response with Claude', duration_ms: 0 },
                ]).map((step, index) => (
                  <div
                    key={step.step_name}
                    className={`relative pl-8 pb-4 ${index < 3 ? 'border-l-2 border-slate-700' : ''} ${
                      activeStep === index ? 'border-violet-500' : ''
                    }`}
                  >
                    <div
                      className={`absolute left-0 -translate-x-1/2 w-4 h-4 rounded-full border-2 ${
                        activeStep === index
                          ? 'bg-violet-500 border-violet-500 animate-pulse'
                          : response && index <= (response.pipeline_steps.length - 1)
                          ? 'bg-green-500 border-green-500'
                          : 'bg-slate-700 border-slate-600'
                      }`}
                    />
                    <div className={`transition-opacity ${activeStep !== null && activeStep < index ? 'opacity-50' : ''}`}>
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-white">{step.step_name}</h4>
                        {step.duration_ms > 0 && (
                          <span className="text-xs text-violet-400">{step.duration_ms}ms</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400">{step.description}</p>

                      {step.data && response && (
                        <div className="mt-2 bg-slate-900/50 rounded-lg p-3 text-xs font-mono text-slate-500 overflow-x-auto">
                          {Object.entries(step.data).slice(0, 4).map(([key, value]) => (
                            <div key={key}>
                              <span className="text-violet-400">{key}:</span>{' '}
                              <span className="text-slate-300">
                                {typeof value === 'object' ? JSON.stringify(value).slice(0, 50) + '...' : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Retrieved Chunks */}
            {response && response.retrieved_chunks.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Database className="w-5 h-5 text-violet-400" />
                  Retrieved Knowledge ({response.retrieved_chunks.length})
                </h3>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {response.retrieved_chunks.map((chunk, i) => (
                    <div key={chunk.chunk_id} className="bg-slate-900/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-500">#{i + 1}</span>
                        <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded">
                          {(chunk.similarity_score * 100).toFixed(1)}% match
                        </span>
                      </div>
                      <p className="text-sm text-slate-300 line-clamp-3">{chunk.content}</p>
                      {chunk.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {chunk.tags.slice(0, 4).map(tag => (
                            <span key={tag} className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Architecture Section */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white text-center mb-8">System Architecture</h2>
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8">
            <div className="flex flex-wrap justify-center gap-4">
              {[
                { name: 'React + TypeScript', color: 'from-blue-500 to-cyan-500' },
                { name: 'FastAPI', color: 'from-green-500 to-emerald-500' },
                { name: 'PostgreSQL', color: 'from-blue-600 to-indigo-600' },
                { name: 'Qdrant Vector DB', color: 'from-purple-500 to-pink-500' },
                { name: 'Voyage AI Embeddings', color: 'from-orange-500 to-amber-500' },
                { name: 'Claude API', color: 'from-violet-500 to-purple-500' },
                { name: 'Redis Cache', color: 'from-red-500 to-rose-500' },
                { name: 'Docker', color: 'from-sky-500 to-blue-500' },
              ].map((tech) => (
                <div
                  key={tech.name}
                  className={`bg-gradient-to-r ${tech.color} px-4 py-2 rounded-lg text-white text-sm font-medium shadow-lg`}
                >
                  {tech.name}
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-slate-400 text-sm flex-wrap">
              <span className="bg-slate-700 px-3 py-1 rounded">User Query</span>
              <ChevronRight className="w-4 h-4" />
              <span className="bg-slate-700 px-3 py-1 rounded">Embedding</span>
              <ChevronRight className="w-4 h-4" />
              <span className="bg-slate-700 px-3 py-1 rounded">Vector Search</span>
              <ChevronRight className="w-4 h-4" />
              <span className="bg-slate-700 px-3 py-1 rounded">Context</span>
              <ChevronRight className="w-4 h-4" />
              <span className="bg-slate-700 px-3 py-1 rounded">LLM</span>
              <ChevronRight className="w-4 h-4" />
              <span className="bg-slate-700 px-3 py-1 rounded">Response</span>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 text-center text-slate-500 text-sm">
          <p>Built by <a href="https://duyng-portfolio.com" className="text-violet-400 hover:underline">Duy Nguyen</a></p>
          <p className="mt-1">Seattle University | MS Data Science | Expected 2026</p>
        </footer>
      </main>
    </div>
  );
}
