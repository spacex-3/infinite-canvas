export function matchesCanvasReferenceQuery(values: string[], query: string) {
    const needle = normalizeQuery(query);
    if (!needle) return true;
    const haystack = values.map(normalizeQuery).join(" ");
    return haystack.includes(needle) || fuzzyIncludes(haystack, needle);
}

export function readCanvasReferenceMention(value: string, cursor: number) {
    const prefix = value.slice(0, cursor);
    const match = /@([^\s@]*)$/.exec(prefix);
    if (!match) return null;
    return { start: cursor - match[1].length - 1, query: match[1] };
}

function normalizeQuery(value: string) {
    return value.toLowerCase().replace(/[\s@#【】\[\]（）()_-]+/g, "");
}

function fuzzyIncludes(haystack: string, needle: string) {
    let cursor = 0;
    for (const char of needle) {
        const index = haystack.indexOf(char, cursor);
        if (index < 0) return false;
        cursor = index + char.length;
    }
    return true;
}
