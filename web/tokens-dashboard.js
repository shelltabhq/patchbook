// TokensOverflow Dashboard Interactive Features

class TokensOverflowDashboard {
  constructor() {
    this.searchInput = document.querySelector('.search');
    this.filterButtons = document.querySelectorAll('.filter');
    this.cards = document.querySelectorAll('.card');
    this.currentFilter = { repository: null, status: null };
    this.allQuestions = [];

    this.init();
  }

  init() {
    this.attachSearchListener();
    this.attachFilterListeners();
    this.loadQuestions();
  }

  attachSearchListener() {
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.performSearch(e.target.value);
      });
    }
  }

  attachFilterListeners() {
    this.filterButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleFilter(button);
      });
    });
  }

  handleFilter(button) {
    const text = button.textContent.trim();

    if (text === '✓ Solved' || text === '○ Unsolved') {
      this.currentFilter.status = text.includes('✓') ? 'solved' : 'unsolved';
    } else if (['coshell', 'shelltab-cloud', 'spix'].includes(text)) {
      this.currentFilter.repository = text;
    }

    button.style.background = 'var(--accent)';
    button.style.color = 'white';

    this.filterQuestions();
  }

  loadQuestions() {
    const querySections = document.querySelectorAll('.section');
    querySections.forEach(section => {
      const cards = section.querySelectorAll('.card');
      cards.forEach(card => {
        card.dataset.title = card.querySelector('.card-title').textContent;
        card.dataset.repository = card.querySelector('.card-meta span').textContent.split(' / ')[0];
        card.dataset.solved = card.classList.contains('unsolved') ? 'unsolved' : 'solved';
      });
    });
  }

  performSearch(query) {
    const cards = document.querySelectorAll('.card');
    const queryLower = query.toLowerCase();

    cards.forEach(card => {
      const title = card.dataset.title?.toLowerCase() || '';
      const matches = title.includes(queryLower);
      card.style.display = matches || query === '' ? 'flex' : 'none';
    });
  }

  filterQuestions() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
      const repo = card.dataset.repository || '';
      const status = card.dataset.solved || '';

      let show = true;

      if (this.currentFilter.repository && repo !== this.currentFilter.repository) {
        show = false;
      }

      if (this.currentFilter.status && status !== this.currentFilter.status) {
        show = false;
      }

      card.style.display = show ? 'flex' : 'none';
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new TokensOverflowDashboard();
});
