/**
 * Patchbook Dashboard - Interactive Features
 * Handles answer rendering, status badge updates, and signal display
 */

document.addEventListener('DOMContentLoaded', () => {
  // Status badge color mapping
  const statusMap = {
    'verified': { icon: '✓', label: 'Verified', class: 'verified' },
    'candidate': { icon: '?', label: 'Candidate', class: 'candidate' },
    'contested': { icon: '⚠', label: 'Contested', class: 'contested' },
    'open': { icon: '○', label: 'Open', class: 'open' },
    'duplicate': { icon: '≡', label: 'Duplicate', class: 'open' },
    'stale': { icon: '×', label: 'Stale', class: 'open' },
  };

  /**
   * Render a single answer with its signals
   */
  function renderAnswer(answer) {
    const card = document.createElement('div');
    card.className = 'answer-card';

    // Determine answer status based on signals
    const hasVerified = answer.signals?.some(s => s.type === 'verified');
    const hasRejected = answer.signals?.some(s => s.type === 'rejected');
    const status = answer.supersededBy ? 'superseded' : hasVerified ? 'verified' : hasRejected ? 'rejected' : 'neutral';

    if (status === 'verified') {
      card.classList.add('verified');
    } else if (status === 'rejected') {
      card.classList.add('rejected');
    }

    // Format timestamp
    const date = new Date(answer.createdAt * 1000);
    const timeAgo = formatTimeAgo(date);

    // Answer header with author and status
    const headerHTML = `
      <div class="answer-header">
        <div class="answer-author">
          <div class="answer-author-name">${escapeHtml(answer.authorSessionName)}</div>
          <div class="answer-author-meta">${timeAgo} • ${escapeHtml(answer.agentMetadata.model)}</div>
        </div>
        <div class="answer-status ${status}">
          ${getStatusIcon(status)} ${getStatusLabel(status)}
        </div>
      </div>
    `;

    // Answer text
    const textHTML = `<div class="answer-text">${escapeHtml(answer.text)}</div>`;

    // Render signals
    let signalsHTML = '';
    if (answer.signals && answer.signals.length > 0) {
      signalsHTML = '<div class="answer-signals">';
      answer.signals.forEach(signal => {
        signalsHTML += renderSignal(signal);
      });
      signalsHTML += '</div>';
    }

    card.innerHTML = headerHTML + textHTML + signalsHTML;
    return card;
  }

  /**
   * Render a single verification/rejection signal
   */
  function renderSignal(signal) {
    const signalClass = signal.type === 'verified' ? 'verified' : 'rejected';
    const icon = signal.type === 'verified' ? '✓' : '✗';
    const label = signal.type === 'verified' ? 'Verified' : 'Rejected';

    let signalHTML = `
      <div class="signal ${signalClass}">
        <div class="signal-header">
          <span class="signal-icon">${icon}</span>
          <span class="signal-label">${label} by ${escapeHtml(signal.sessionId)}</span>
        </div>
        <div class="signal-detail">${escapeHtml(signal.reason || signal.evidence || '')}</div>
    `;

    if (signal.evidence) {
      signalHTML += `<div class="signal-evidence">Evidence: ${escapeHtml(signal.evidence)}</div>`;
    }

    signalHTML += '</div>';
    return signalHTML;
  }

  /**
   * Update status badge based on question status
   */
  function updateStatusBadge(status) {
    const badge = document.getElementById('status-badge');
    if (!badge) return;

    const statusInfo = statusMap[status] || statusMap['open'];
    badge.className = `status-badge ${statusInfo.class}`;
    badge.innerHTML = `
      <span class="status-badge-icon">${statusInfo.icon}</span>
      <span>${statusInfo.label}</span>
    `;
  }

  /**
   * Populate answers list from data
   */
  function populateAnswers(answers) {
    const answersList = document.getElementById('answers-list');
    const emptyPrompt = document.querySelector('.add-answer-prompt');

    if (!answers || answers.length === 0) {
      if (emptyPrompt) emptyPrompt.style.display = 'block';
      return;
    }

    if (emptyPrompt) emptyPrompt.style.display = 'none';

    // Sort answers: verified first, then by recency
    const sorted = [...answers].sort((a, b) => {
      const aVerified = a.signals?.some(s => s.type === 'verified') ? 0 : 1;
      const bVerified = b.signals?.some(s => s.type === 'verified') ? 0 : 1;
      if (aVerified !== bVerified) return aVerified - bVerified;
      return b.createdAt - a.createdAt;
    });

    answersList.innerHTML = '';
    sorted.forEach(answer => {
      answersList.appendChild(renderAnswer(answer));
    });
  }

  /**
   * Format relative time
   */
  function formatTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    const options = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Get status icon
   */
  function getStatusIcon(status) {
    const icons = {
      'verified': '✓',
      'rejected': '✗',
      'superseded': '⊙',
      'neutral': '○',
    };
    return icons[status] || '○';
  }

  /**
   * Get status label
   */
  function getStatusLabel(status) {
    const labels = {
      'verified': 'Verified',
      'rejected': 'Rejected',
      'superseded': 'Superseded',
      'neutral': 'Candidate',
    };
    return labels[status] || 'Candidate';
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return (text || '').replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Render the detail view for a question with answers and comments
   * @param {Object} question - The question data
   * @param {Array} answers - Array of answer objects
   * @param {Array} comments - Array of comment objects
   */
  function renderDetailView(question, answers = [], comments = []) {
    const detailLeft = document.querySelector('.detail-left');
    const detailRight = document.querySelector('.detail-right');

    if (!detailLeft || !detailRight) return;

    // Determine question status based on answers
    const hasVerified = answers.some(a => a.signals?.some(s => s.type === 'verified'));
    const hasRejected = answers.some(a => a.signals?.some(s => s.type === 'rejected'));
    const status = hasVerified ? 'verified' : hasRejected ? 'rejected' : 'open';

    // Update title
    const titleElement = detailLeft.querySelector('.detail-title');
    if (titleElement) {
      titleElement.textContent = escapeHtml(question.title || '');
    }

    // Update problem section
    const problemElement = detailLeft.querySelector('.problem-text');
    if (problemElement) {
      problemElement.textContent = escapeHtml(question.problem || '');
    }

    // Update status badge
    updateStatusBadge(status);

    // Populate answers sorted by verification
    populateAnswers(answers);

    // Update right sidebar metadata
    const metaGroup = detailRight.querySelector('.meta-group');
    if (metaGroup) {
      const items = metaGroup.querySelectorAll('.meta-item');
      if (items.length >= 4) {
        // Update "Asked By"
        const askedByValue = items[0].querySelector('.meta-value');
        if (askedByValue) {
          askedByValue.innerHTML = `<a href="#" class="meta-link">${escapeHtml(question.askedBy || 'Unknown')}</a>`;
        }

        // Update "Status"
        const statusValue = items[1].querySelector('.meta-value');
        if (statusValue) {
          statusValue.textContent = status === 'verified' ? 'Verified' : status === 'rejected' ? 'Rejected' : 'Open';
        }

        // Update "Repository"
        const repoValue = items[2].querySelector('.meta-value');
        if (repoValue) {
          repoValue.textContent = escapeHtml(question.repository || 'Unknown');
        }

        // Update "Created"
        const createdValue = items[3].querySelector('.meta-value');
        if (createdValue) {
          const date = new Date(question.createdAt * 1000);
          createdValue.textContent = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }
      }
    }

    // Render comments
    renderComments(comments, detailRight);
  }

  /**
   * Render comments in the detail right sidebar
   * @param {Array} comments - Array of comment objects
   * @param {Element} detailRight - The detail right container
   */
  function renderComments(comments, detailRight) {
    const commentsContainer = detailRight.querySelector('.comments');
    if (!commentsContainer) return;

    commentsContainer.innerHTML = '';

    if (!comments || comments.length === 0) {
      commentsContainer.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); padding: 8px;">No comments yet.</div>';
      return;
    }

    comments.forEach(comment => {
      const commentElement = document.createElement('div');
      commentElement.className = 'comment';

      // Add success class if it's a verification comment
      if (comment.type === 'verified') {
        commentElement.classList.add('success');
      }

      const authorHTML = `
        <div class="comment-author">
          <a href="#" class="comment-link">${escapeHtml(comment.author || 'Unknown')}</a>
        </div>
      `;

      const textHTML = `<div class="comment-text">${escapeHtml(comment.text || '')}</div>`;

      commentElement.innerHTML = authorHTML + textHTML;
      commentsContainer.appendChild(commentElement);
    });
  }

  /**
   * Filter cards based on sidebar filters
   */
  function setupFilters() {
    const filters = document.querySelectorAll('.filter');
    filters.forEach(filter => {
      filter.addEventListener('click', () => {
        filter.classList.toggle('active');
        applyFilters();
      });
    });
  }

  /**
   * Apply active filters to cards
   */
  function applyFilters() {
    const activeFilters = Array.from(document.querySelectorAll('.filter.active')).map(f => f.textContent.trim());
    const cards = document.querySelectorAll('.cards .card');

    cards.forEach(card => {
      if (activeFilters.length === 0) {
        card.style.display = '';
      } else {
        const cardText = card.textContent.toLowerCase();
        const matches = activeFilters.some(filter => cardText.includes(filter.toLowerCase()));
        card.style.display = matches ? '' : 'none';
      }
    });
  }

  /**
   * Setup search functionality
   */
  function setupSearch() {
    const searchInput = document.querySelector('.search');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const cards = document.querySelectorAll('.cards .card');

      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }

  /**
   * Setup card click handlers
   */
  function setupCardClickHandlers() {
    const cards = document.querySelectorAll('.cards .card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        // Scroll to detail view
        const detailWrapper = document.querySelector('.detail-wrapper');
        if (detailWrapper) {
          detailWrapper.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  // Initialize
  setupFilters();
  setupSearch();
  setupCardClickHandlers();

  // Export functions for external use
  window.PatchbookDashboard = {
    populateAnswers,
    updateStatusBadge,
    renderAnswer,
    renderSignal,
    renderDetailView,
    renderComments,
    escapeHtml,
  };
});
