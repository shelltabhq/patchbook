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
  };
});
