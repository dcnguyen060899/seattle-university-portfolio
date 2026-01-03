import { useState } from 'react';
import { Search, Loader2, FileText, Calendar, Tag } from 'lucide-react';
import { api } from '../api/client';
import type { SearchResult, SearchResultItem } from '../types';

export default function SearchPanel() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const searchResult = await api.search({
        query: query.trim(),
        top_k: 10,
      });
      setResult(searchResult);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-100';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-100';
    return 'text-gray-600 bg-gray-100';
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Search Knowledge</h1>
        <p className="text-gray-600 mt-1">
          Find past learnings, solutions, and insights using natural language
        </p>
      </div>

      <div className="card mb-6">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-10"
              placeholder="Search your knowledge... (e.g., 'that CORS error I solved')"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="btn-primary px-6"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </button>
        </form>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm mb-6">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Found <span className="font-medium text-gray-900">{result.total_results}</span> results
              for "{result.query}"
            </p>
          </div>

          {result.results.length === 0 ? (
            <div className="card text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No results found</h3>
              <p className="text-gray-600 mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="space-y-3">
              {result.results.map((item: SearchResultItem, index: number) => (
                <div
                  key={item.note_id}
                  className="card-hover animate-slideUp"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900">{item.preview}</p>

                      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-gray-500">
                        {item.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {item.tags.slice(0, 3).map((tag, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {item.source && (
                          <span className="text-gray-400">from {item.source}</span>
                        )}

                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`px-2 py-1 rounded text-xs font-medium ${getScoreColor(
                        item.score
                      )}`}
                    >
                      {Math.round(item.score * 100)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !isLoading && (
        <div className="card text-center py-12">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Search your knowledge base</h3>
          <p className="text-gray-600 mt-1 max-w-md mx-auto">
            Use natural language to find past solutions, learnings, and insights.
            Try searching for specific errors, concepts, or projects.
          </p>
        </div>
      )}
    </div>
  );
}
