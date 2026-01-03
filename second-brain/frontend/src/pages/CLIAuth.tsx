import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Brain, Check, Loader2, Terminal, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

export default function CLIAuth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<'loading' | 'authenticating' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No authentication token provided. Please run /second-brain login in Claude Code.');
      return;
    }

    // If not authenticated, redirect to login with return URL
    if (!isAuthenticated) {
      navigate(`/login?redirect=/cli-auth?token=${token}`);
      return;
    }

    // Complete the CLI authentication
    completeCLIAuth();
  }, [token, isAuthenticated]);

  const completeCLIAuth = async () => {
    if (!token) return;

    setStatus('authenticating');

    try {
      await api.completeCLIAuth(token);
      setStatus('success');

      // Close window after 3 seconds
      setTimeout(() => {
        window.close();
      }, 3000);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setStatus('error');
      setError(error.response?.data?.detail || 'Authentication failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-primary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-violet-600 rounded-2xl mb-4">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Second Brain</h1>
          <p className="text-gray-600 mt-1">CLI Authentication</p>
        </div>

        {/* Status Card */}
        <div className="card">
          {status === 'loading' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-violet-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Initializing...</p>
            </div>
          )}

          {status === 'authenticating' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-violet-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Connecting Claude Code to your account...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Connected!</h2>
              <p className="text-gray-600 mb-4">
                Claude Code is now connected to your Second Brain account.
              </p>
              <div className="bg-gray-50 rounded-lg p-4 text-left">
                <div className="flex items-center text-sm text-gray-600 mb-2">
                  <Terminal className="w-4 h-4 mr-2" />
                  <span>Authenticated as:</span>
                </div>
                <p className="font-medium text-gray-900">{user?.email}</p>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                This window will close automatically...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Failed</h2>
              <p className="text-gray-600 mb-4">{error}</p>
              <button
                onClick={() => navigate('/login')}
                className="btn-primary"
              >
                Go to Login
              </button>
            </div>
          )}
        </div>

        {/* Help text */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Having trouble? Run <code className="bg-gray-100 px-2 py-1 rounded">/second-brain login</code> in Claude Code</p>
        </div>
      </div>
    </div>
  );
}
