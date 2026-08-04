(() => {
  if (window.__chzzzEditorialMotion) return;
  window.__chzzzEditorialMotion = true;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let activeSession = null;

  const generatedSelector = '[data-home-motion]';

  const removeGenerated = () => {
    document.querySelectorAll(generatedSelector).forEach(node => node.remove());
  };

  const clearEnhancementClasses = () => {
    document.documentElement.classList.remove('hm-enhanced');
    document.documentElement.removeAttribute('data-editorial-page');
    document.querySelectorAll('.hm-reveal, .hm-profile-reveal').forEach(node => {
      node.classList.remove('hm-reveal', 'hm-profile-reveal', 'is-visible');
      node.style.removeProperty('--hm-reveal-delay');
      node.style.removeProperty('--hm-card-rotate-x');
      node.style.removeProperty('--hm-card-rotate-y');
    });
  };

  const cleanup = () => {
    if (!activeSession) {
      removeGenerated();
      clearEnhancementClasses();
      return;
    }

    activeSession.controller.abort();
    activeSession.observer?.disconnect();
    activeSession.cleanups.forEach(cleanupItem => cleanupItem());
    activeSession.controls.forEach(control => {
      delete control.dataset.homeMotionKeyboard;
    });

    activeSession = null;
    removeGenerated();
    clearEnhancementClasses();
  };

  const addKeyboardActivation = (session, selector, label) => {
    const control = document.querySelector(selector);
    if (!control || control.dataset.homeMotionKeyboard) return;

    control.dataset.homeMotionKeyboard = 'true';
    control.setAttribute('role', 'button');
    control.tabIndex = 0;
    control.setAttribute('aria-label', label);
    control.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      control.click();
    }, { signal: session.controller.signal });
    session.controls.push(control);
  };

  const classifyEditorialPage = () => {
    let pageType = null;

    if (document.querySelector('#article-container')) pageType = 'post';
    else if (document.querySelector('#archive')) pageType = 'archive';
    else if (document.querySelector('.tag-cloud-list')) pageType = 'tags-index';
    else if (document.querySelector('.category-lists')) pageType = 'categories-index';
    else if (document.querySelector('#recommendations')) pageType = 'recommendations';
    else if (document.querySelector('#tag')) pageType = 'tag-detail';
    else if (document.querySelector('#category')) pageType = 'category-detail';

    if (pageType) document.documentElement.dataset.editorialPage = pageType;
  };

  const createTopic = value => {
    const topic = document.createElement('span');
    topic.className = 'editorial-index__topic';
    topic.textContent = value;
    return topic;
  };

  const createIssueIndex = content => {
    const index = document.createElement('aside');
    const lead = document.createElement('span');
    const topics = document.createElement('div');
    const count = document.createElement('span');
    const entryCount = document.querySelectorAll('#recent-posts .recent-post-item').length;

    index.className = 'editorial-index';
    index.dataset.homeMotion = 'index';
    index.setAttribute('aria-label', 'Editorial index');

    lead.className = 'editorial-index__lead';
    lead.textContent = 'FIELD NOTES';
    topics.className = 'editorial-index__topics';
    ['WEB SYSTEMS', 'DEVOPS', 'LIFE LOG'].forEach(value => topics.append(createTopic(value)));
    count.className = 'editorial-index__count';
    count.textContent = `${String(entryCount).padStart(2, '0')} ENTRIES`;

    index.append(lead, topics, count);
    content.insertBefore(index, content.firstElementChild);
  };

  const addHeroFrame = hero => {
    const frame = document.createElement('div');
    const mark = document.createElement('span');

    frame.className = 'hero-motion-frame';
    frame.dataset.homeMotion = 'hero-frame';
    frame.setAttribute('aria-hidden', 'true');
    mark.className = 'hero-motion-frame__mark';
    mark.textContent = 'ISSUE / 01';
    frame.append(mark);
    hero.append(frame);
  };

  const setupHeroParallax = (session, hero) => {
    if (reducedMotion.matches || !finePointer.matches) return;

    let frame = 0;
    let nextX = 0;
    let nextY = 0;

    const apply = () => {
      frame = 0;
      hero.style.setProperty('--hm-frame-x', `${nextX.toFixed(2)}px`);
      hero.style.setProperty('--hm-frame-y', `${nextY.toFixed(2)}px`);
    };

    const reset = () => {
      nextX = 0;
      nextY = 0;
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    hero.addEventListener('pointermove', event => {
      const bounds = hero.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;

      nextX = x * 10;
      nextY = y * 8;
      if (!frame) frame = window.requestAnimationFrame(apply);
    }, { passive: true, signal: session.controller.signal });
    hero.addEventListener('pointerleave', reset, { signal: session.controller.signal });
    session.cleanups.push(() => {
      if (frame) window.cancelAnimationFrame(frame);
      hero.style.removeProperty('--hm-frame-x');
      hero.style.removeProperty('--hm-frame-y');
    });
  };

  const setupCardTilt = (session, cards) => {
    if (reducedMotion.matches || !finePointer.matches) return;

    cards.forEach(card => {
      let frame = 0;
      let rotateX = 0;
      let rotateY = 0;

      const apply = () => {
        frame = 0;
        card.style.setProperty('--hm-card-rotate-x', `${rotateX.toFixed(2)}deg`);
        card.style.setProperty('--hm-card-rotate-y', `${rotateY.toFixed(2)}deg`);
      };

      const reset = () => {
        rotateX = 0;
        rotateY = 0;
        if (!frame) frame = window.requestAnimationFrame(apply);
      };

      card.addEventListener('pointermove', event => {
        const bounds = card.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;

        rotateX = y * -1.8;
        rotateY = x * 1.8;
        if (!frame) frame = window.requestAnimationFrame(apply);
      }, { passive: true, signal: session.controller.signal });
      card.addEventListener('pointerleave', reset, { signal: session.controller.signal });
      session.cleanups.push(() => {
        if (frame) window.cancelAnimationFrame(frame);
      });
    });
  };

  const setupReveal = (session, cards, profile) => {
    if (reducedMotion.matches || !('IntersectionObserver' in window)) return;

    const targets = cards.map((card, index) => {
      card.classList.add('hm-reveal');
      card.style.setProperty('--hm-reveal-delay', `${Math.min(index, 4) * 70}ms`);
      return card;
    });

    if (profile) {
      profile.classList.add('hm-profile-reveal');
      targets.push(profile);
    }

    if (!targets.length) return;

    session.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        session.observer?.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -28px', threshold: 0.1 });

    targets.forEach(target => session.observer.observe(target));
  };

  const setupReadingProgress = (session, article) => {
    const progress = document.createElement('div');
    const bar = document.createElement('div');
    let frame = 0;

    progress.className = 'reading-progress';
    progress.dataset.homeMotion = 'reading-progress';
    progress.setAttribute('aria-hidden', 'true');
    bar.className = 'reading-progress__bar';
    progress.append(bar);
    document.body.append(progress);

    const update = () => {
      frame = 0;
      const articleTop = article.getBoundingClientRect().top + window.scrollY;
      const travel = Math.max(1, article.offsetHeight - window.innerHeight * 0.35);
      const value = Math.min(1, Math.max(0, (window.scrollY - articleTop + window.innerHeight * 0.35) / travel));
      bar.style.setProperty('--reading-progress', value.toFixed(4));
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', requestUpdate, { passive: true, signal: session.controller.signal });
    window.addEventListener('resize', requestUpdate, { passive: true, signal: session.controller.signal });
    requestUpdate();
    session.cleanups.push(() => {
      if (frame) window.cancelAnimationFrame(frame);
    });
  };

  const addMobileSectionRail = article => {
    const post = article.closest('#post');
    const headings = [...article.querySelectorAll('h2[id]')];

    if (!post || headings.length < 2) return;

    const rail = document.createElement('nav');
    const label = document.createElement('span');

    rail.className = 'mobile-section-rail';
    rail.dataset.homeMotion = 'section-rail';
    rail.setAttribute('aria-label', 'Article sections');
    label.className = 'mobile-section-rail__label';
    label.textContent = 'SECTION INDEX';
    rail.append(label);

    headings.forEach((heading, index) => {
      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.textContent = `${String(index + 1).padStart(2, '0')}. ${heading.textContent.trim()}`;
      rail.append(link);
    });

    post.insertBefore(rail, article);
  };

  const init = () => {
    cleanup();

    const session = {
      controller: new AbortController(),
      observer: null,
      controls: [],
      cleanups: []
    };
    activeSession = session;

    addKeyboardActivation(session, '#search-button', 'Open search');
    addKeyboardActivation(session, '#toggle-menu', 'Open menu');
    addKeyboardActivation(session, '#scroll-down', 'Scroll to latest posts');
    classifyEditorialPage();

    const hero = document.querySelector('#page-header.full_page');
    const article = document.querySelector('#article-container');

    if (hero) {
      document.documentElement.classList.add('hm-enhanced');
      addHeroFrame(hero);
      setupHeroParallax(session, hero);

      const content = document.querySelector('#page-header.full_page + #content-inner');
      const cards = [...document.querySelectorAll('#recent-posts .recent-post-item')];
      const profile = content?.querySelector(':scope > #aside-content') ?? null;

      if (content) createIssueIndex(content);
      setupReveal(session, cards, profile);
      setupCardTilt(session, cards);
    }

    if (article) {
      addMobileSectionRail(article);
      setupReadingProgress(session, article);
    }
  };

  const scheduleInit = () => window.requestAnimationFrame(init);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  document.addEventListener('pjax:send', cleanup);
  document.addEventListener('pjax:complete', scheduleInit);
  document.addEventListener('pjax:error', scheduleInit);
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('pageshow', scheduleInit);

  const handleMotionChange = () => scheduleInit();
  reducedMotion.addEventListener?.('change', handleMotionChange);
  finePointer.addEventListener?.('change', handleMotionChange);
})();
