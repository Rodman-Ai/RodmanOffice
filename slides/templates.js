/*
 * RodmanSlides — starter templates for the New-presentation gallery.
 * Single global: window.RodmanSlideTemplates (array of {name, summary,
 * build()}). Each build() returns a fresh deck object using only the
 * primitives in deck.js, so no new model code is needed.
 */
(function () {
  'use strict';
  const D = window.RodmanDeck;
  if (!D) return;

  // Build a deck with the given title and an ordered list of slide layouts.
  function deckWith(title, layouts) {
    const deck = D.newDeck({ title });
    deck.slides = layouts.map((layout) => D.newSlide({ layout, theme: deck.theme }));
    return deck;
  }

  window.RodmanSlideTemplates = [
    {
      name: 'Blank',
      summary: 'A single empty title slide.',
      build() { return D.newDeck(); },
    },
    {
      name: 'Pitch deck',
      summary: 'Title plus five content slides.',
      build() {
        return deckWith('Pitch Deck', [
          'title', 'titleAndContent', 'titleAndContent',
          'titleAndContent', 'titleAndContent', 'titleAndContent',
        ]);
      },
    },
    {
      name: 'Lesson',
      summary: 'Title, a section header, and three content slides.',
      build() {
        return deckWith('Lesson', [
          'title', 'sectionHeader', 'titleAndContent',
          'titleAndContent', 'titleAndContent',
        ]);
      },
    },
    {
      name: 'Report',
      summary: 'Title, content, a comparison, and a closing section.',
      build() {
        return deckWith('Report', [
          'title', 'titleAndContent', 'twoContent', 'sectionHeader',
        ]);
      },
    },
    {
      name: 'Photo deck',
      summary: 'Title plus three blank slides for full-bleed images.',
      build() {
        return deckWith('Photo Deck', ['title', 'blank', 'blank', 'blank']);
      },
    },
  ];
})();
