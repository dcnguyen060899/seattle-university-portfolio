import { useState } from 'react';
import {
  Brain,
  Plus,
  Search,
  MessageSquare,
  BookOpen,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import CapturePanel from '../components/CapturePanel';
import SearchPanel from '../components/SearchPanel';
import ChatPanel from '../components/ChatPanel';
import ReviewPanel from '../components/ReviewPanel';

type Tab = 'capture' | 'search' | 'chat' | 'review';

const tabs: { id: Tab; label: string; icon: typeof Plus }[] = [
  { id: 'capture', label: 'Capture', icon: Plus },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'review', label: 'Review', icon: BookOpen },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('capture');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200
                   transform transition-transform duration-200 ease-in-out
                   ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-4 py-5 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-gray-900">Second Brain</span>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium
                             transition-colors
                             ${
                               isActive
                                 ? 'bg-violet-50 text-violet-700'
                                 : 'text-gray-600 hover:bg-gray-100'
                             }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-violet-600' : 'text-gray-400'}`} />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center">
                <span className="text-violet-600 font-medium">
                  {user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.email}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.subscription_tier} plan</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-600
                        hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-4 px-4 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900">Second Brain</span>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-4 lg:p-8">
          <div className="max-w-4xl mx-auto">
            {activeTab === 'capture' && <CapturePanel />}
            {activeTab === 'search' && <SearchPanel />}
            {activeTab === 'chat' && <ChatPanel />}
            {activeTab === 'review' && <ReviewPanel />}
          </div>
        </div>
      </main>
    </div>
  );
}
