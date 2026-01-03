import { useState, useEffect } from 'react';
import { BookOpen, Loader2, Check, Flame, Trophy, Brain } from 'lucide-react';
import { api } from '../api/client';
import type { ReviewDue, ReviewStats } from '../types';

const ratingLabels = [
  { value: 0, label: 'Blackout', color: 'bg-red-500' },
  { value: 1, label: 'Wrong', color: 'bg-red-400' },
  { value: 2, label: 'Hard', color: 'bg-orange-400' },
  { value: 3, label: 'Good', color: 'bg-yellow-400' },
  { value: 4, label: 'Easy', color: 'bg-green-400' },
  { value: 5, label: 'Perfect', color: 'bg-green-500' },
];

export default function ReviewPanel() {
  const [reviews, setReviews] = useState<ReviewDue[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [lastResult, setLastResult] = useState<{ interval: number } | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [reviewData, statsData] = await Promise.all([
        api.getDueReviews(10),
        api.getReviewStats(),
      ]);
      setReviews(reviewData.reviews);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRating = async (rating: number) => {
    const currentReview = reviews[currentIndex];
    if (!currentReview || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const result = await api.submitReview(currentReview.note_id, rating);
      setLastResult({ interval: result.interval_days });

      // Move to next review after a brief delay
      setTimeout(() => {
        if (currentIndex < reviews.length - 1) {
          setCurrentIndex((prev) => prev + 1);
          setShowAnswer(false);
          setLastResult(null);
        } else {
          setSessionComplete(true);
        }
      }, 1500);
    } catch (err) {
      console.error('Failed to submit review:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentReview = reviews[currentIndex];

  if (isLoading) {
    return (
      <div className="animate-fadeIn flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Spaced Repetition Review</h1>
        <p className="text-gray-600 mt-1">
          Strengthen your memory with scientifically-proven review intervals
        </p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card text-center">
            <BookOpen className="w-6 h-6 text-violet-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{stats.due_today}</p>
            <p className="text-xs text-gray-500">Due Today</p>
          </div>
          <div className="card text-center">
            <Flame className="w-6 h-6 text-orange-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{stats.current_streak}</p>
            <p className="text-xs text-gray-500">Day Streak</p>
          </div>
          <div className="card text-center">
            <Trophy className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{stats.total_reviews}</p>
            <p className="text-xs text-gray-500">Total Reviews</p>
          </div>
          <div className="card text-center">
            <Brain className="w-6 h-6 text-green-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">
              {stats.average_ease_factor.toFixed(1)}
            </p>
            <p className="text-xs text-gray-500">Avg Ease</p>
          </div>
        </div>
      )}

      {/* Review card */}
      {reviews.length === 0 ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">All caught up!</h3>
          <p className="text-gray-600 mt-1">No reviews due right now. Great job!</p>
        </div>
      ) : sessionComplete ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-violet-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">Session Complete!</h3>
          <p className="text-gray-600 mt-1">
            You reviewed {reviews.length} items. Keep up the great work!
          </p>
          <button
            onClick={() => {
              setSessionComplete(false);
              setCurrentIndex(0);
              loadData();
            }}
            className="btn-primary mt-6"
          >
            Start New Session
          </button>
        </div>
      ) : (
        <div className="card">
          {/* Progress */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">
              Review {currentIndex + 1} of {reviews.length}
            </span>
            <div className="flex gap-1">
              {reviews.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${
                    i < currentIndex
                      ? 'bg-green-500'
                      : i === currentIndex
                      ? 'bg-violet-500'
                      : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Question */}
          <div className="mb-6">
            <p className="text-sm text-gray-500 mb-2">What do you remember about:</p>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-900 font-medium">
                {currentReview.content_preview}
              </p>
            </div>
            {currentReview.tags.length > 0 && (
              <div className="flex gap-1 mt-2">
                {currentReview.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-violet-50 text-violet-600 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Show answer button */}
          {!showAnswer && !lastResult && (
            <button
              onClick={() => setShowAnswer(true)}
              className="btn-secondary w-full mb-4"
            >
              Show Answer
            </button>
          )}

          {/* Rating buttons */}
          {showAnswer && !lastResult && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 text-center">
                How well did you remember?
              </p>
              <div className="grid grid-cols-3 gap-2">
                {ratingLabels.map((rating) => (
                  <button
                    key={rating.value}
                    onClick={() => handleRating(rating.value)}
                    disabled={isSubmitting}
                    className={`py-3 rounded-lg font-medium text-white transition-all
                              hover:opacity-90 disabled:opacity-50 ${rating.color}`}
                  >
                    <span className="text-lg">{rating.value}</span>
                    <br />
                    <span className="text-xs opacity-90">{rating.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Result feedback */}
          {lastResult && (
            <div className="text-center py-4 animate-fadeIn">
              <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-gray-900 font-medium">
                Next review in {lastResult.interval} days
              </p>
            </div>
          )}

          {/* Meta info */}
          <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 flex justify-between">
            <span>Reviews: {currentReview.review_count}</span>
            <span>Ease: {currentReview.ease_factor.toFixed(2)}</span>
            {currentReview.last_reviewed_at && (
              <span>
                Last: {new Date(currentReview.last_reviewed_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
