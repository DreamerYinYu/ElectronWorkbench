export function applyAppearance(settings: { theme: string; fontSize: number }): void {
  document.documentElement.setAttribute('data-theme', settings.theme)
  const zoom = typeof settings.fontSize === 'number' && settings.fontSize > 0 ? settings.fontSize : 1
  document.documentElement.style.zoom = String(zoom)
}
