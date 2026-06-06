export function buildPromptHref(href: string, prompt: string) {
    const text = prompt.trim();
    if (!text) return href;
    return `${href}?${new URLSearchParams({ prompt: text }).toString()}`;
}
