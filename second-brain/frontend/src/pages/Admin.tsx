import { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Plus,
  Trash2,
  Edit3,
  Search,
  RefreshCw,
  TestTube,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
  Home,
  Tag,
  FileText,
  BarChart3
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Types
interface KnowledgeEntry {
  id: string;
  content: string;
  source: string;
  tags: string[];
  category: string | null;
  priority: string | null;
  created_at: string;
  updated_at: string | null;
}

interface AdminStats {
  total_entries: number;
  total_chunks: number;
  categories: Record<string, number>;
  tags_used: string[];
  last_updated: string | null;
}

interface TestQueryResult {
  query: string;
  answer: string;
  retrieved_count: number;
  top_chunks: Array<{
    content: string;
    score: number;
    tags: string[];
    source: string;
  }>;
  duration_ms: number;
}

// Admin API calls
const adminApi = {
  getStats: async (adminKey: string): Promise<AdminStats> => {
    const res = await fetch(`${API_URL}/api/v1/admin/stats`, {
      headers: { 'X-Admin-Key': adminKey }
    });
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  listKnowledge: async (adminKey: string, category?: string): Promise<{ total: number; entries: KnowledgeEntry[] }> => {
    const url = new URL(`${API_URL}/api/v1/admin/knowledge`);
    if (category) url.searchParams.set('category', category);
    url.searchParams.set('limit', '100');

    const res = await fetch(url.toString(), {
      headers: { 'X-Admin-Key': adminKey }
    });
    if (!res.ok) throw new Error('Failed to fetch knowledge');
    return res.json();
  },

  createEntry: async (adminKey: string, entry: Partial<KnowledgeEntry>): Promise<KnowledgeEntry> => {
    const res = await fetch(`${API_URL}/api/v1/admin/knowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey
      },
      body: JSON.stringify(entry)
    });
    if (!res.ok) throw new Error('Failed to create entry');
    return res.json();
  },

  updateEntry: async (adminKey: string, id: string, entry: Partial<KnowledgeEntry>): Promise<KnowledgeEntry> => {
    const res = await fetch(`${API_URL}/api/v1/admin/knowledge/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey
      },
      body: JSON.stringify(entry)
    });
    if (!res.ok) throw new Error('Failed to update entry');
    return res.json();
  },

  deleteEntry: async (adminKey: string, id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/api/v1/admin/knowledge/${id}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Key': adminKey }
    });
    if (!res.ok) throw new Error('Failed to delete entry');
  },

  testQuery: async (adminKey: string, query: string): Promise<TestQueryResult> => {
    const res = await fetch(`${API_URL}/api/v1/admin/test-query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey
      },
      body: JSON.stringify({ query })
    });
    if (!res.ok) throw new Error('Failed to test query');
    return res.json();
  },

  reseed: async (adminKey: string): Promise<{ status: string; entries_created: number }> => {
    const res = await fetch(`${API_URL}/api/v1/admin/reseed`, {
      method: 'POST',
      headers: { 'X-Admin-Key': adminKey }
    });
    if (!res.ok) throw new Error('Failed to reseed');
    return res.json();
  }
};

// Components
function StatsCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  onEdit,
  onDelete,
  isExpanded,
  onToggle
}: {
  entry: KnowledgeEntry;
  onEdit: () => void;
  onDelete: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      <div
        className="p-4 cursor-pointer flex items-start justify-between"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {entry.category && (
              <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-xs font-medium">
                {entry.category}
              </span>
            )}
            {entry.priority && (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                entry.priority === 'high' ? 'bg-red-100 text-red-700' :
                entry.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {entry.priority}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 line-clamp-2">
            {entry.content.substring(0, 150)}...
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {entry.tags.slice(0, 5).map(tag => (
              <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                {tag}
              </span>
            ))}
            {entry.tags.length > 5 && (
              <span className="text-xs text-gray-400">+{entry.tags.length - 5} more</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded transition-colors"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans bg-gray-50 p-3 rounded-lg">
            {entry.content}
          </pre>
          <div className="mt-3 text-xs text-gray-400">
            Created: {new Date(entry.created_at).toLocaleString()}
            {entry.updated_at && ` | Updated: ${new Date(entry.updated_at).toLocaleString()}`}
          </div>
        </div>
      )}
    </div>
  );
}

function EntryForm({
  entry,
  onSave,
  onCancel,
  isLoading
}: {
  entry?: KnowledgeEntry;
  onSave: (data: Partial<KnowledgeEntry>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [content, setContent] = useState(entry?.content || '');
  const [category, setCategory] = useState(entry?.category || 'general');
  const [priority, setPriority] = useState(entry?.priority || 'medium');
  const [tags, setTags] = useState(entry?.tags.join(', ') || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      content,
      category,
      priority,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      source: 'portfolio'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {entry ? 'Edit Knowledge Entry' : 'Add Knowledge Entry'}
          </h3>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              rows={8}
              required
              minLength={10}
              placeholder="Enter the knowledge content..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              >
                <option value="about">About</option>
                <option value="education">Education</option>
                <option value="projects">Projects</option>
                <option value="skills">Skills</option>
                <option value="experience">Experience</option>
                <option value="contact">Contact</option>
                <option value="general">General</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="e.g., project, python, machine-learning"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || content.length < 10}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {entry ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TestQueryPanel({
  adminKey,
  onClose
}: {
  adminKey: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<TestQueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTest = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const res = await adminApi.testQuery(adminKey, query);
      setResult(res);
    } catch (err) {
      setError('Failed to test query');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <TestTube className="w-5 h-5 text-violet-600" />
            Test RAG Query
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTest()}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="Enter a test query (e.g., 'What projects has Duy worked on?')"
            />
            <button
              onClick={handleTest}
              disabled={isLoading || !query.trim()}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Test
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900">Answer</h4>
                  <span className="text-xs text-gray-500">
                    {result.retrieved_count} chunks | {result.duration_ms.toFixed(0)}ms
                  </span>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">{result.answer}</p>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">Retrieved Chunks</h4>
                <div className="space-y-2">
                  {result.top_chunks.map((chunk, i) => (
                    <div key={i} className="p-3 bg-white border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex gap-1">
                          {chunk.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded text-xs">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <span className="text-xs font-medium text-green-600">
                          {(chunk.score * 100).toFixed(0)}% match
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{chunk.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Main Admin Component
export default function Admin() {
  const [adminKey, setAdminKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showTestQuery, setShowTestQuery] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!adminKey) return;

    setIsLoading(true);
    setError('');

    try {
      const [statsData, knowledgeData] = await Promise.all([
        adminApi.getStats(adminKey),
        adminApi.listKnowledge(adminKey, categoryFilter || undefined)
      ]);
      setStats(statsData);
      setEntries(knowledgeData.entries);
      setIsAuthenticated(true);
    } catch (err) {
      setError('Invalid admin key or failed to load data');
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, [adminKey, categoryFilter]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [categoryFilter, isAuthenticated, loadData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await loadData();
  };

  const handleSaveEntry = async (data: Partial<KnowledgeEntry>) => {
    setIsSaving(true);
    setError('');

    try {
      if (editingEntry) {
        await adminApi.updateEntry(adminKey, editingEntry.id, data);
        setSuccess('Entry updated successfully');
      } else {
        await adminApi.createEntry(adminKey, data);
        setSuccess('Entry created successfully');
      }
      setEditingEntry(null);
      setIsCreating(false);
      await loadData();
    } catch (err) {
      setError('Failed to save entry');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;

    try {
      await adminApi.deleteEntry(adminKey, id);
      setSuccess('Entry deleted successfully');
      await loadData();
    } catch (err) {
      setError('Failed to delete entry');
    }
  };

  const handleReseed = async () => {
    if (!confirm('This will clear all entries and reseed from seed_data.py. Continue?')) return;

    setIsLoading(true);
    setError('');

    try {
      const result = await adminApi.reseed(adminKey);
      setSuccess(`Reseeded successfully: ${result.entries_created} entries created`);
      await loadData();
    } catch (err) {
      setError('Failed to reseed');
    } finally {
      setIsLoading(false);
    }
  };

  // Clear success/error messages after 3 seconds
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess('');
        setError('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-violet-100 rounded-full mb-4">
              <Database className="w-8 h-8 text-violet-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Portfolio Admin</h1>
            <p className="text-gray-500 mt-1">Manage your knowledge base</p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Key</label>
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="Enter admin key"
                required
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Login
            </button>
          </form>

          <div className="mt-6 text-center">
            <a href="/" className="text-sm text-gray-500 hover:text-violet-600 flex items-center justify-center gap-1">
              <Home className="w-4 h-4" />
              Back to Portfolio
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Main admin panel
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-violet-600" />
            <h1 className="text-xl font-bold text-gray-900">Portfolio Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTestQuery(true)}
              className="px-3 py-1.5 text-sm text-violet-600 hover:bg-violet-50 rounded-lg transition-colors flex items-center gap-1"
            >
              <TestTube className="w-4 h-4" />
              Test Query
            </button>
            <button
              onClick={handleReseed}
              disabled={isLoading}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Reseed
            </button>
            <a
              href="/"
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
            >
              <Home className="w-4 h-4" />
              Portfolio
            </a>
          </div>
        </div>
      </header>

      {/* Notifications */}
      {(success || error) && (
        <div className={`fixed top-20 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center gap-2 animate-slideUp ${
          success ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {success ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {success || error}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatsCard icon={FileText} label="Knowledge Entries" value={stats.total_entries} color="bg-violet-600" />
            <StatsCard icon={Database} label="Vector Chunks" value={stats.total_chunks} color="bg-blue-600" />
            <StatsCard icon={Tag} label="Tags Used" value={stats.tags_used.length} color="bg-green-600" />
            <StatsCard icon={BarChart3} label="Categories" value={Object.keys(stats.categories).length} color="bg-orange-600" />
          </div>
        )}

        {/* Filters & Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Category:</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              >
                <option value="">All</option>
                {stats && Object.keys(stats.categories).map(cat => (
                  <option key={cat} value={cat}>{cat} ({stats.categories[cat]})</option>
                ))}
              </select>
            </div>

            <div className="flex-1" />

            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Entry
            </button>
          </div>
        </div>

        {/* Entries List */}
        <div className="space-y-3">
          {isLoading && entries.length === 0 ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 text-violet-600 animate-spin mx-auto" />
              <p className="text-gray-500 mt-2">Loading...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Database className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No knowledge entries found</p>
              <button
                onClick={() => setIsCreating(true)}
                className="mt-4 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
              >
                Add your first entry
              </button>
            </div>
          ) : (
            entries.map(entry => (
              <EntryCard
                key={entry.id}
                entry={entry}
                onEdit={() => setEditingEntry(entry)}
                onDelete={() => handleDeleteEntry(entry.id)}
                isExpanded={expandedId === entry.id}
                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              />
            ))
          )}
        </div>
      </main>

      {/* Modals */}
      {(isCreating || editingEntry) && (
        <EntryForm
          entry={editingEntry || undefined}
          onSave={handleSaveEntry}
          onCancel={() => { setIsCreating(false); setEditingEntry(null); }}
          isLoading={isSaving}
        />
      )}

      {showTestQuery && (
        <TestQueryPanel
          adminKey={adminKey}
          onClose={() => setShowTestQuery(false)}
        />
      )}
    </div>
  );
}
