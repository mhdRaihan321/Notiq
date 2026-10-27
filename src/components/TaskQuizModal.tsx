'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Check,
  Award,
  AlertTriangle,
  AlertCircle,
  Lightbulb,
} from 'lucide-react';
import {
  QuizQuestion,
  WrongQuestionDetail,
  generateQuizForTopic,
  generateRelearnPlan,
  isQuizzableTopic,
} from '@/lib/aiService';

interface TaskQuizModalProps {
  isOpen: boolean;
  todo: {
    id: string;
    title: string;
    topicHeading?: string;
    description?: string;
    subItems?: Array<{ text: string; prefix?: string }>;
    questions?: QuizQuestion[];
  } | null;
  onClose: () => void;
  onPass: (score: number) => void;
  onFail?: (score: number) => void;
  onUpdateQuestions?: (taskId: string, questions: QuizQuestion[]) => void;
}

export default function TaskQuizModal({
  isOpen,
  todo,
  onClose,
  onPass,
  onFail,
  onUpdateQuestions,
}: TaskQuizModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [quizError, setQuizError] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [relearnPlan, setRelearnPlan] = useState<string>('');
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [activeTab, setActiveTab] = useState<'quiz' | 'relearn' | 'review'>('quiz');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Track which todo ID has already been fetched or loaded so we NEVER loop
  const loadedTodoIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);

  // Keep latest callbacks in refs so they never cause re-fetching
  const onPassRef = useRef(onPass);
  onPassRef.current = onPass;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onUpdateQuestionsRef = useRef(onUpdateQuestions);
  onUpdateQuestionsRef.current = onUpdateQuestions;

  const executeQuizFetch = useCallback(async (targetTodo: NonNullable<TaskQuizModalProps['todo']>) => {
    if (isFetchingRef.current) return;
    const subtopics = targetTodo.subItems?.map((s) => s.text) || [];

    // If it's a non-study task, skip quiz directly
    if (!isQuizzableTopic(targetTodo.title, subtopics)) {
      onPassRef.current(10);
      onCloseRef.current();
      return;
    }

    setLoadingQuestions(true);
    setQuizError(false);
    isFetchingRef.current = true;

    try {
      const qs = await generateQuizForTopic(targetTodo.title, subtopics);
      if (!qs || qs.length === 0) {
        setQuizError(true);
      } else {
        setQuestions(qs);
        onUpdateQuestionsRef.current?.(targetTodo.id, qs);
      }
    } catch (err) {
      console.error('Quiz generation error:', err);
      setQuizError(true);
    } finally {
      setLoadingQuestions(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Initialize or fetch questions when modal opens
  useEffect(() => {
    if (!isOpen || !todo) {
      loadedTodoIdRef.current = null;
      isFetchingRef.current = false;
      return;
    }

    // Guard against infinite loop: do not re-run if already loaded for this todo ID
    if (loadedTodoIdRef.current === todo.id) return;
    loadedTodoIdRef.current = todo.id;

    setCurrentIdx(0);
    setSelectedAnswers({});
    setIsSubmitted(false);
    setScore(0);
    setRelearnPlan('');
    setActiveTab('quiz');
    setQuizError(false);

    if (todo.questions && todo.questions.length >= 10) {
      setQuestions(todo.questions);
      setLoadingQuestions(false);
      return;
    }

    executeQuizFetch(todo);
  }, [isOpen, todo?.id, executeQuizFetch]);

  const handleRetry = () => {
    if (!todo) return;
    isFetchingRef.current = false;
    executeQuizFetch(todo);
  };

  if (!isOpen || !todo || !mounted || typeof document === 'undefined') return null;

  const currentQ = questions[currentIdx];
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(selectedAnswers).length;
  const passingScore = 7; // User needs at least 7/10

  const handleSelectOption = (optionIndex: number) => {
    if (isSubmitted) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentIdx]: optionIndex,
    }));
  };

  const handleSubmit = async () => {
    let correctCount = 0;
    const wrongDetails: WrongQuestionDetail[] = [];

    questions.forEach((q, idx) => {
      const userAns = selectedAnswers[idx];
      if (userAns === q.correctAnswer) {
        correctCount += 1;
      } else {
        wrongDetails.push({
          question: q.question,
          userAnswer: userAns !== undefined ? q.options[userAns] : 'Not answered',
          correctAnswer: q.options[q.correctAnswer],
          explanation: q.explanation,
          subtopic: q.subtopic,
        });
      }
    });

    setScore(correctCount);
    setIsSubmitted(true);

    if (correctCount >= passingScore) {
      setActiveTab('review');
    } else {
      setActiveTab('relearn');
      if (wrongDetails.length > 0) {
        setGeneratingPlan(true);
        generateRelearnPlan(todo.title, wrongDetails)
          .then((plan) => setRelearnPlan(plan))
          .catch(() => setRelearnPlan('Failed to generate automatic guide. Please review the wrong answers in the review tab.'))
          .finally(() => setGeneratingPlan(false));
      }
    }
  };

  const handleRetake = () => {
    setSelectedAnswers({});
    setIsSubmitted(false);
    setCurrentIdx(0);
    setActiveTab('quiz');
    setRelearnPlan('');
  };

  const handleFinishPassed = () => {
    onPass(score);
    onClose();
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 780,
          maxHeight: '92vh',
          background: 'var(--bg-secondary, #18181b)',
          borderRadius: 20,
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(124, 58, 237, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--text-primary, #ffffff)',
          animation: 'fadeInScale 0.22s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes fadeInScale {
            from { opacity: 0; transform: scale(0.96) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes pulseGlow {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
        `}</style>

        {/* Modal Top Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)',
                flexShrink: 0,
              }}
            >
              <Award size={20} color="#fff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: 'rgba(124, 58, 237, 0.2)',
                    color: '#c4b5fd',
                    border: '1px solid rgba(124, 58, 237, 0.35)',
                  }}
                >
                  Topic Mastery Quiz
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: '#a1a1aa',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  🎯 Pass requirement: <strong>7 / 10 (70%)</strong>
                </span>
              </div>
              <h3
                style={{
                  margin: '3px 0 0',
                  fontSize: 17,
                  fontWeight: 700,
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 520,
                }}
              >
                {todo.title}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #a1a1aa)',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 8,
              fontSize: 18,
              lineHeight: 1,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#a1a1aa';
            }}
          >
            ✕
          </button>
        </div>

        {/* Loading State */}
        {loadingQuestions && (
          <div
            style={{
              padding: '60px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                border: '3px solid rgba(124, 58, 237, 0.2)',
                borderTopColor: '#7c3aed',
                animation: 'spin 0.8s linear infinite',
                marginBottom: 20,
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <h4 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600 }}>
              AI is crafting your 10-question evaluation...
            </h4>
            <p style={{ margin: 0, fontSize: 13, color: '#a1a1aa', maxWidth: 440 }}>
              Formulating specific conceptual, practical, and code-based questions based on "{todo.title}" and its curriculum subtopics.
            </p>
          </div>
        )}

        {/* Error / Empty State */}
        {!loadingQuestions && questions.length === 0 && (
          <div
            style={{
              padding: '60px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <AlertCircle size={26} color="#ef4444" />
            </div>
            <h4 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600 }}>
              Could not generate evaluation questions
            </h4>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: '#a1a1aa', maxWidth: 440, lineHeight: 1.5 }}>
              The AI quiz generator is temporarily busy or encountered a network error. You can retry generating questions, or complete the task directly.
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                onClick={handleRetry}
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                  color: '#fff',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)',
                }}
              >
                <RotateCcw size={15} />
                <span>Retry Generation</span>
              </button>
              <button
                onClick={() => {
                  onPass(10);
                  onClose();
                }}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#e4e4e7',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Skip Quiz & Complete Task
              </button>
            </div>
          </div>
        )}

        {/* Loaded Body */}
        {!loadingQuestions && questions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* Post-submission Navigation Tabs */}
            {isSubmitted && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 24px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(0,0,0,0.15)',
                }}
              >
                {score < passingScore && (
                  <button
                    onClick={() => setActiveTab('relearn')}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      color: activeTab === 'relearn' ? '#f59e0b' : '#a1a1aa',
                      borderBottom: activeTab === 'relearn' ? '2px solid #f59e0b' : '2px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <BookOpen size={15} />
                    <span>AI Relearn & Revision Plan</span>
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('review')}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    color: activeTab === 'review' ? '#818cf8' : '#a1a1aa',
                    borderBottom: activeTab === 'review' ? '2px solid #818cf8' : '2px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <CheckCircle2 size={15} />
                  <span>Question Review ({score}/{totalQuestions})</span>
                </button>
              </div>
            )}

            {/* TAB: RELEARN PLAN (Displayed when failed score < 7) */}
            {isSubmitted && activeTab === 'relearn' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                {/* Result Banner */}
                <div
                  style={{
                    padding: '16px 20px',
                    borderRadius: 14,
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: 'rgba(239, 68, 68, 0.2)',
                        color: '#f87171',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#fca5a5' }}>
                        Score: {score} / {totalQuestions} (Need 7 / 10 to complete)
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.7)' }}>
                        Task remained in progress. Revise the concepts below and re-attempt to mark as complete.
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleRetake}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '9px 16px',
                      borderRadius: 9,
                      border: 'none',
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                    }}
                  >
                    <RotateCcw size={14} />
                    <span>Re-attempt Quiz</span>
                  </button>
                </div>

                {/* AI Relearn Content */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 14,
                    padding: '20px 24px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: '#fbbf24',
                      fontSize: 14,
                      fontWeight: 700,
                      marginBottom: 14,
                    }}
                  >
                    <Lightbulb size={18} />
                    <span>Personalized AI Revision & Mastery Guide</span>
                  </div>

                  {generatingPlan ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: '#a1a1aa' }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          border: '2px solid rgba(245, 158, 11, 0.2)',
                          borderTopColor: '#f59e0b',
                          margin: '0 auto 10px',
                          animation: 'spin 0.8s linear infinite',
                        }}
                      />
                      <span>Synthesizing targeted notes on the specific questions you missed...</span>
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: 13.5,
                        lineHeight: 1.65,
                        color: 'rgba(255, 255, 255, 0.9)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {relearnPlan}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: REVIEW ALL QUESTIONS (After submission) */}
            {isSubmitted && activeTab === 'review' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                {score >= passingScore ? (
                  <div
                    style={{
                      padding: '20px 24px',
                      borderRadius: 14,
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      marginBottom: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 16,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 12,
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 6px 16px rgba(16, 185, 129, 0.4)',
                        }}
                      >
                        <Check size={28} strokeWidth={3} />
                      </div>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#34d399' }}>
                          Passed! Score: {score} / {totalQuestions} ({Math.round((score / totalQuestions) * 100)}%)
                        </div>
                        <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.8)' }}>
                          Excellent work! You met the required 70% threshold. You can now mark this task as Completed.
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleFinishPassed}
                      style={{
                        padding: '11px 22px',
                        borderRadius: 10,
                        border: 'none',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 6px 18px rgba(16, 185, 129, 0.35)',
                      }}
                    >
                      ✓ Complete Task Now
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '14px 18px',
                      borderRadius: 12,
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      marginBottom: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 14, color: '#f87171', fontWeight: 600 }}>
                      Score: {score}/10 — Review which questions you missed below.
                    </span>
                    <button
                      onClick={handleRetake}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 7,
                        border: 'none',
                        background: 'rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      🔄 Retake Quiz
                    </button>
                  </div>
                )}

                {/* Review Questions List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {questions.map((q, idx) => {
                    const userAns = selectedAnswers[idx];
                    const isCorrect = userAns === q.correctAnswer;

                    return (
                      <div
                        key={q.id || idx}
                        style={{
                          background: isCorrect ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                          border: `1px solid ${isCorrect ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                          borderRadius: 12,
                          padding: '16px 20px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.45 }}>
                            {idx + 1}. {q.question}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 5,
                              background: isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                              color: isCorrect ? '#34d399' : '#f87171',
                              flexShrink: 0,
                            }}
                          >
                            {isCorrect ? 'Correct ✓' : 'Incorrect ✕'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                          {q.options.map((opt, oIdx) => {
                            const isSelected = userAns === oIdx;
                            const isAnswer = q.correctAnswer === oIdx;

                            let optBg = 'rgba(255, 255, 255, 0.02)';
                            let optColor = '#a1a1aa';
                            let optBorder = '1px solid rgba(255, 255, 255, 0.06)';

                            if (isAnswer) {
                              optBg = 'rgba(16, 185, 129, 0.15)';
                              optColor = '#34d399';
                              optBorder = '1px solid rgba(16, 185, 129, 0.4)';
                            } else if (isSelected && !isAnswer) {
                              optBg = 'rgba(239, 68, 68, 0.15)';
                              optColor = '#f87171';
                              optBorder = '1px solid rgba(239, 68, 68, 0.4)';
                            }

                            return (
                              <div
                                key={oIdx}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: 8,
                                  background: optBg,
                                  color: optColor,
                                  border: optBorder,
                                  fontSize: 12.5,
                                  fontWeight: isAnswer || isSelected ? 600 : 400,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                }}
                              >
                                <span style={{ fontWeight: 700, opacity: 0.7 }}>
                                  {String.fromCharCode(65 + oIdx)}.
                                </span>
                                <span style={{ flex: 1 }}>{opt}</span>
                                {isAnswer && <CheckCircle2 size={15} color="#34d399" />}
                                {isSelected && !isAnswer && <XCircle size={15} color="#f87171" />}
                              </div>
                            );
                          })}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: '#a1a1aa',
                            background: 'rgba(0, 0, 0, 0.25)',
                            padding: '8px 12px',
                            borderRadius: 6,
                            lineHeight: 1.45,
                          }}
                        >
                          <strong style={{ color: '#fff' }}>Explanation:</strong> {q.explanation}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: ACTIVE QUIZ (Questions 1 to 10) */}
            {!isSubmitted && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {/* Stepper / Progress Bar */}
                <div style={{ padding: '14px 24px 10px', background: 'rgba(255,255,255,0.01)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                      Question {currentIdx + 1} of {totalQuestions}
                    </span>
                    <span style={{ fontSize: 12, color: '#a1a1aa' }}>
                      Answered: <strong>{answeredCount}</strong> / {totalQuestions}
                    </span>
                  </div>

                  {/* Progress Line */}
                  <div
                    style={{
                      width: '100%',
                      height: 5,
                      background: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: 3,
                      overflow: 'hidden',
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${((currentIdx + 1) / totalQuestions) * 100}%`,
                        background: 'linear-gradient(90deg, #7c3aed 0%, #38bdf8 100%)',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>

                  {/* Question navigation pills */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {questions.map((_, qIdx) => {
                      const isCurrent = qIdx === currentIdx;
                      const isAnswered = selectedAnswers[qIdx] !== undefined;

                      return (
                        <button
                          key={qIdx}
                          onClick={() => setCurrentIdx(qIdx)}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: isCurrent
                              ? '2px solid #7c3aed'
                              : '1px solid rgba(255, 255, 255, 0.1)',
                            background: isCurrent
                              ? 'rgba(124, 58, 237, 0.3)'
                              : isAnswered
                              ? 'rgba(16, 185, 129, 0.2)'
                              : 'rgba(255, 255, 255, 0.03)',
                            color: isCurrent
                              ? '#fff'
                              : isAnswered
                              ? '#34d399'
                              : '#a1a1aa',
                            fontSize: 12,
                            fontWeight: isCurrent || isAnswered ? 700 : 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}
                        >
                          {qIdx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Question Body */}
                {currentQ && (
                  <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
                    {/* Subtopic Badge */}
                    {currentQ.subtopic && (
                      <div style={{ marginBottom: 10 }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 650,
                            padding: '3px 8px',
                            borderRadius: 5,
                            background: 'rgba(56, 189, 248, 0.14)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                          }}
                        >
                          📌 {currentQ.subtopic}
                        </span>
                      </div>
                    )}

                    {/* Question text */}
                    <h4
                      style={{
                        margin: '0 0 20px',
                        fontSize: 17,
                        fontWeight: 700,
                        color: '#ffffff',
                        lineHeight: 1.5,
                      }}
                    >
                      {currentQ.question}
                    </h4>

                    {/* 4 Options */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {currentQ.options.map((optText, optIdx) => {
                        const isSelected = selectedAnswers[currentIdx] === optIdx;

                        return (
                          <button
                            key={optIdx}
                            onClick={() => handleSelectOption(optIdx)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 14,
                              padding: '14px 18px',
                              borderRadius: 12,
                              border: isSelected
                                ? '1.5px solid #7c3aed'
                                : '1px solid rgba(255, 255, 255, 0.09)',
                              background: isSelected
                                ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.22) 0%, rgba(79, 70, 229, 0.15) 100%)'
                                : 'rgba(255, 255, 255, 0.02)',
                              color: isSelected ? '#ffffff' : '#d4d4d8',
                              fontSize: 14,
                              fontWeight: isSelected ? 650 : 400,
                              textAlign: 'left',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxShadow: isSelected
                                ? '0 4px 14px rgba(124, 58, 237, 0.25)'
                                : 'none',
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.09)';
                              }
                            }}
                          >
                            <span
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                background: isSelected
                                  ? '#7c3aed'
                                  : 'rgba(255, 255, 255, 0.08)',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifySelf: 'center',
                                justifyContent: 'center',
                                fontSize: 13,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {String.fromCharCode(65 + optIdx)}
                            </span>
                            <span style={{ flex: 1, lineHeight: 1.45 }}>{optText}</span>
                            {isSelected && (
                              <span
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: '50%',
                                  background: '#7c3aed',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#fff',
                                  fontSize: 12,
                                  flexShrink: 0,
                                }}
                              >
                                ✓
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Footer Controls */}
                <div
                  style={{
                    padding: '14px 24px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(0, 0, 0, 0.15)',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
                    disabled={currentIdx === 0}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '9px 16px',
                      borderRadius: 8,
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      color: currentIdx === 0 ? 'rgba(255,255,255,0.25)' : '#fff',
                      fontSize: 13,
                      cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <ArrowLeft size={15} />
                    <span>Previous</span>
                  </button>

                  <div style={{ display: 'flex', gap: 10 }}>
                    {currentIdx < totalQuestions - 1 ? (
                      <button
                        onClick={() => setCurrentIdx((prev) => Math.min(totalQuestions - 1, prev + 1))}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '9px 18px',
                          borderRadius: 8,
                          border: 'none',
                          background: 'rgba(255, 255, 255, 0.1)',
                          color: '#fff',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <span>Next</span>
                        <ArrowRight size={15} />
                      </button>
                    ) : (
                      <button
                        onClick={handleSubmit}
                        disabled={answeredCount < totalQuestions}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 22px',
                          borderRadius: 8,
                          border: 'none',
                          background:
                            answeredCount < totalQuestions
                              ? 'rgba(124, 58, 237, 0.3)'
                              : 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                          color: '#fff',
                          fontSize: 13.5,
                          fontWeight: 700,
                          cursor: answeredCount < totalQuestions ? 'not-allowed' : 'pointer',
                          boxShadow:
                            answeredCount < totalQuestions
                              ? 'none'
                              : '0 4px 16px rgba(124, 58, 237, 0.4)',
                        }}
                      >
                        <span>Submit & Check Mastery</span>
                        <Check size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
