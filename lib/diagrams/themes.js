// Six themes, each a palette + default shape style. Switching themes
// re-tints every shape that still carries its theme-default fill /
// stroke / text color (and leaves customised shapes alone).

export const THEMES = [
  {
    id: 'office',
    name: 'Office',
    palette: ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'],
    fill: '#DAE3F3',
    stroke: '#2E5597',
    textColor: '#1F2937',
    pageBg: '#FFFFFF',
    fontFamily: 'Calibri, Segoe UI, sans-serif',
  },
  {
    id: 'slate',
    name: 'Slate',
    palette: ['#1F2937', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB', '#F3F4F6'],
    fill: '#374151',
    stroke: '#111827',
    textColor: '#F9FAFB',
    pageBg: '#1F2937',
    fontFamily: 'Inter, Segoe UI, sans-serif',
  },
  {
    id: 'marigold',
    name: 'Marigold',
    palette: ['#F59E0B', '#EA580C', '#DC2626', '#FDBA74', '#FCD34D', '#FEF3C7'],
    fill: '#FED7AA',
    stroke: '#9A3412',
    textColor: '#7C2D12',
    pageBg: '#FFFBEB',
    fontFamily: 'Georgia, serif',
  },
  {
    id: 'mist',
    name: 'Mist',
    palette: ['#A7C7E7', '#BFD7EA', '#C8E0F4', '#D9EAF7', '#E6F0FA', '#F0F6FB'],
    fill: '#D9EAF7',
    stroke: '#3B82A6',
    textColor: '#1E3A52',
    pageBg: '#F0F6FB',
    fontFamily: 'Segoe UI, sans-serif',
  },
  {
    id: 'tech',
    name: 'Tech',
    palette: ['#06B6D4', '#0891B2', '#0E7490', '#155E75', '#164E63', '#22D3EE'],
    fill: '#0E7490',
    stroke: '#22D3EE',
    textColor: '#ECFEFF',
    pageBg: '#0F172A',
    fontFamily: 'Consolas, Menlo, monospace',
  },
  {
    id: 'print',
    name: 'Print',
    palette: ['#000000', '#404040', '#808080', '#BFBFBF', '#E5E5E5', '#FFFFFF'],
    fill: '#FFFFFF',
    stroke: '#000000',
    textColor: '#000000',
    pageBg: '#FFFFFF',
    fontFamily: 'Times New Roman, serif',
  },
];

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

// Apply theme defaults to a shape that hasn't been customised. The
// editor calls this when the user switches themes — shapes that the
// user explicitly recolored keep their custom values (we track that
// via a `_themed` truthy flag set when the shape was created from
// the theme defaults).
export function applyThemeToShape(shape, theme) {
  if (shape._themed) {
    shape.fill = theme.fill;
    shape.stroke = theme.stroke;
    if (shape.textStyle) shape.textStyle.color = theme.textColor;
  }
}

export function applyThemeToDiagram(diagram) {
  const theme = getTheme(diagram.theme);
  for (const page of diagram.pages) {
    page.bg = theme.pageBg;
    for (const shape of page.shapes) applyThemeToShape(shape, theme);
    for (const conn of page.connectors) {
      if (conn._themed) conn.stroke = theme.stroke;
    }
  }
}
