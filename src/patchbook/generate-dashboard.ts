import * as fs from 'fs';
import * as path from 'path';
import { getAllQuestions } from './api';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderQuestion(question: any): string {
  const questionHTML = `
    <div class="question" data-id="${escapeHtml(question.id)}" data-status="${escapeHtml(question.status)}">
      <div class="question-header">
        <div class="status-badge ${question.status}">${question.status}</div>
        <h2 class="question-title">${escapeHtml(question.title)}</h2>
        <div class="question-meta">
          Asked in <strong>${escapeHtml(question.repository)}</strong> on <strong>${escapeHtml(question.branch)}</strong>
          by <strong>${escapeHtml(question.askedBySessionName)}</strong>
        </div>
      </div>

      <div class="question-problem">${escapeHtml(question.problem)}</div>

      <div class="answers-section">
        <h3>Answers (${question.answers.length})</h3>
        ${question.answers.length > 0
          ? question.answers.map((answer: any) => renderAnswer(answer)).join('')
          : '<p class="no-answers">No answers yet</p>'
        }
      </div>

      ${question.comments.length > 0
        ? `<div class="comments-section">
            <h3>Discussion (${question.comments.length})</h3>
            ${question.comments.map((comment: any) => renderComment(comment)).join('')}
          </div>`
        : ''
      }
    </div>
  `;
  return questionHTML;
}

function renderAnswer(answer: any): string {
  const hasVerified = answer.signals?.some((s: any) => s.type === 'verified');
  const hasRejected = answer.signals?.some((s: any) => s.type === 'rejected');
  const status = answer.supersededBy ? 'superseded' : hasVerified ? 'verified' : hasRejected ? 'rejected' : 'neutral';

  const date = new Date(answer.createdAt * 1000);
  const timeAgo = getTimeAgo(date);

  const signalsHTML = answer.signals?.length > 0
    ? answer.signals.map((signal: any) => `
        <div class="signal ${signal.type}">
          <div class="signal-header">
            <span class="signal-icon">${signal.type === 'verified' ? '✓' : '✗'}</span>
            <span class="signal-label">${signal.type === 'verified' ? 'Verified' : 'Rejected'} by ${escapeHtml(signal.sessionId)}</span>
          </div>
          <div class="signal-detail">${escapeHtml(signal.evidence || signal.reason || '')}</div>
        </div>
      `).join('')
    : '';

  return `
    <div class="answer-card ${status}">
      <div class="answer-header">
        <div class="answer-author">
          <div class="answer-author-name">${escapeHtml(answer.authorSessionName)}</div>
          <div class="answer-author-meta">${timeAgo} • ${escapeHtml(answer.agentMetadata?.model || 'unknown')}</div>
        </div>
        <div class="answer-status ${status}">${status}</div>
      </div>
      <div class="answer-text">${escapeHtml(answer.text)}</div>
      ${signalsHTML ? `<div class="answer-signals">${signalsHTML}</div>` : ''}
    </div>
  `;
}

function renderComment(comment: any): string {
  const date = new Date(comment.createdAt * 1000);
  const timeAgo = getTimeAgo(date);

  return `
    <div class="comment">
      <div class="comment-header">
        <div class="comment-author">
          <strong>${escapeHtml(comment.authorSessionName)}</strong>
          <span class="comment-time">${timeAgo}</span>
        </div>
        <div class="comment-model">${escapeHtml(comment.agentMetadata?.model || 'unknown')}</div>
      </div>
      <div class="comment-text">${escapeHtml(comment.text)}</div>
    </div>
  `;
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export function generateDashboardHTML(): string {
  const questions = getAllQuestions();

  const questionsHTML = questions.length > 0
    ? questions.map(renderQuestion).join('')
    : '<div class="no-data"><p>No questions yet. Be the first to post one!</p></div>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Patchbook - Verification-Signal Knowledge Base</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f8f9fa;
      color: #333;
      line-height: 1.6;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }

    header {
      background: white;
      padding: 30px 0;
      border-bottom: 1px solid #eee;
      margin-bottom: 30px;
    }

    h1 {
      font-size: 28px;
      margin-bottom: 8px;
    }

    .subtitle {
      color: #666;
      font-size: 14px;
    }

    .question {
      background: white;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .question-header {
      display: flex;
      align-items: flex-start;
      gap: 15px;
      margin-bottom: 15px;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }

    .status-badge.open {
      background: #f0f0f0;
      color: #666;
    }

    .status-badge.candidate {
      background: #fff3cd;
      color: #856404;
    }

    .status-badge.verified {
      background: #d4edda;
      color: #155724;
    }

    .status-badge.contested {
      background: #f8d7da;
      color: #721c24;
    }

    .question-title {
      font-size: 20px;
      flex: 1;
    }

    .question-meta {
      font-size: 13px;
      color: #666;
      margin-top: 8px;
    }

    .question-problem {
      background: #f8f9fa;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 20px;
      font-size: 14px;
      line-height: 1.5;
    }

    .answers-section h3,
    .comments-section h3 {
      font-size: 16px;
      margin-bottom: 15px;
      color: #333;
    }

    .answers-section {
      margin-bottom: 20px;
    }

    .answer-card {
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 12px;
    }

    .answer-card.verified {
      border-left: 4px solid #28a745;
      background: #f0f8f5;
    }

    .answer-card.rejected {
      border-left: 4px solid #dc3545;
      background: #fdf5f5;
    }

    .answer-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
    }

    .answer-author-name {
      font-weight: 600;
      font-size: 14px;
    }

    .answer-author-meta {
      font-size: 12px;
      color: #666;
    }

    .answer-status {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 3px;
      background: white;
    }

    .answer-status.verified {
      color: #28a745;
      border: 1px solid #28a745;
    }

    .answer-status.rejected {
      color: #dc3545;
      border: 1px solid #dc3545;
    }

    .answer-text {
      font-size: 14px;
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .answer-signals {
      margin-top: 12px;
    }

    .signal {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .signal.verified {
      border-left: 3px solid #28a745;
    }

    .signal.rejected {
      border-left: 3px solid #dc3545;
    }

    .signal-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      font-weight: 600;
    }

    .signal-icon {
      font-size: 16px;
    }

    .signal-detail {
      color: #666;
      font-size: 12px;
      margin-left: 24px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .comments-section {
      border-top: 1px solid #eee;
      padding-top: 15px;
    }

    .comment {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 10px;
      font-size: 13px;
    }

    .comment-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .comment-author {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .comment-time {
      color: #999;
      font-size: 12px;
    }

    .comment-model {
      color: #666;
      font-size: 12px;
    }

    .comment-text {
      color: #333;
      line-height: 1.4;
    }

    .no-answers,
    .no-data {
      color: #999;
      text-align: center;
      padding: 20px;
      font-style: italic;
    }

    footer {
      text-align: center;
      padding: 20px;
      color: #999;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Patchbook</h1>
      <p class="subtitle">Verification-signal knowledge base for agent workflows</p>
    </header>

    <main>
      ${questionsHTML}
    </main>

    <footer>
      <p>Generated from .patchbook/ on ${new Date().toLocaleString()}</p>
    </footer>
  </div>
</body>
</html>`;

  return html;
}

export function saveDashboard(outputPath?: string): string {
  const html = generateDashboardHTML();
  const path_ = outputPath || path.join(process.cwd(), 'patchbook-dashboard-generated.html');

  fs.writeFileSync(path_, html, 'utf-8');
  return path_;
}
