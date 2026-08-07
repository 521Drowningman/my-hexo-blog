(() => {
  if (window.__chzzzRecommendations) return;
  window.__chzzzRecommendations = true;

  const normalize = value => (value || '').trim().toLowerCase();

  const init = () => {
    const root = document.querySelector('[data-recommendations]');
    if (!root || root.dataset.recommendationsReady === 'true') return;

    root.dataset.recommendationsReady = 'true';
    const cards = [...root.querySelectorAll('[data-recommendation-item]')];
    const filters = [...root.querySelectorAll('button[data-recommendation-filter]')];
    const sections = [...root.querySelectorAll('[data-recommendation-section]')];
    const search = root.querySelector('[data-recommendation-search-input]');
    const count = root.querySelector('[data-recommendation-count]');
    const empty = root.querySelector('[data-recommendation-empty]');
    let activeFilter = 'all';

    const apply = () => {
      const query = normalize(search?.value);
      let visibleCount = 0;

      cards.forEach(card => {
        const cardFilters = normalize(card.dataset.recommendationFilter).split('|');
        const matchesFilter = activeFilter === 'all' || cardFilters.includes(activeFilter);
        const matchesSearch = !query || normalize(card.dataset.recommendationSearch).includes(query);
        const isVisible = matchesFilter && matchesSearch;

        card.hidden = !isVisible;
        card.classList.toggle('is-filtered-out', !isVisible);
        if (isVisible) visibleCount += 1;
      });

      sections.forEach(section => {
        const sectionCards = [...section.querySelectorAll('[data-recommendation-item]')];
        section.hidden = !sectionCards.some(card => !card.hidden);
      });

      filters.forEach(filter => {
        const isActive = filter.dataset.recommendationFilter === activeFilter;
        filter.classList.toggle('is-active', isActive);
        filter.setAttribute('aria-pressed', String(isActive));
      });

      if (count) count.textContent = String(visibleCount).padStart(2, '0');
      if (empty) empty.hidden = visibleCount !== 0;
    };

    filters.forEach(filter => {
      filter.addEventListener('click', () => {
        activeFilter = normalize(filter.dataset.recommendationFilter) || 'all';
        apply();
      });
    });

    search?.addEventListener('input', apply);
    search?.addEventListener('search', apply);
    apply();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  document.addEventListener('pjax:complete', init);
})();
