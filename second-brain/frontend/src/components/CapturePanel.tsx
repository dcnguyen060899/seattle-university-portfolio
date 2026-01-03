import { useState } from 'react';
import { Plus, Loader2, Check, Link2, Tag, Folder } from 'lucide-react';
import { api } from '../api/client';
import type { CaptureResult } from '../types';

export default function CapturePanel() {
  const [content, setContent] = useState('');
  const [source, setSource] = useState('');
  const [tags, setTags] = useState('');
  const [project, setProject] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const captureResult = await api.createNote({
        content: content.trim(),
        source: source.trim() || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        context: project ? { project: project.trim() } : undefined,
      });

      setResult(captureResult);
      setContent('');
      setSource('');
      setTags('');
      setProject('');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to capture knowledge');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Capture Knowledge</h1>
        <p className="text-gray-600 mt-1">
          Add new insights, solutions, and learnings to your Second Brain
        </p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="content" className="label">
              What did you learn?
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input min-h-[150px] resize-y"
              placeholder="Describe what you learned, a problem you solved, or an insight you had..."
              required
            />
            <p className="mt-1 text-xs text-gray-400">
              {content.length} characters
            </p>
          </div>

          {/* Advanced options toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-violet-600 hover:text-violet-700 font-medium"
          >
            {showAdvanced ? 'Hide' : 'Show'} advanced options
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-2">
              <div>
                <label htmlFor="source" className="label flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-gray-400" />
                  Source
                </label>
                <input
                  id="source"
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="input"
                  placeholder="e.g., claude-code, documentation, tutorial"
                />
              </div>

              <div>
                <label htmlFor="tags" className="label flex items-center gap-2">
                  <Tag className="w-4 h-4 text-gray-400" />
                  Tags
                </label>
                <input
                  id="tags"
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="input"
                  placeholder="python, debugging, api (comma-separated)"
                />
              </div>

              <div>
                <label htmlFor="project" className="label flex items-center gap-2">
                  <Folder className="w-4 h-4 text-gray-400" />
                  Project
                </label>
                <input
                  id="project"
                  type="text"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  className="input"
                  placeholder="e.g., second-brain, portfolio"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !content.trim()}
            className="btn-primary w-full py-3"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Capturing...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Capture Knowledge
              </>
            )}
          </button>
        </form>
      </div>

      {/* Success result */}
      {result && (
        <div className="mt-6 card border-green-200 bg-green-50 animate-slideUp">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-green-800">Knowledge Captured!</h3>
              <p className="text-sm text-green-700 mt-1">{result.message}</p>

              <div className="mt-4 space-y-2">
                {result.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-green-600 font-medium">Tags:</span>
                    {result.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {result.entities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-green-600 font-medium">Entities:</span>
                    {result.entities.map((entity, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-xs"
                      >
                        {entity}
                      </span>
                    ))}
                  </div>
                )}

                {result.connections.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-green-200">
                    <p className="text-xs text-green-600 font-medium mb-2">
                      Connected to {result.connections.length} related notes:
                    </p>
                    {result.connections.slice(0, 3).map((conn, i) => (
                      <div
                        key={i}
                        className="text-sm text-green-700 py-1 flex items-center justify-between"
                      >
                        <span className="truncate flex-1">{conn.preview}</span>
                        <span className="text-xs text-green-500 ml-2">
                          {Math.round(conn.strength * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
