type Replacement = string | ((substring: string, ...args: unknown[]) => string);

export function replaceAllCompat(value: string, search: string | RegExp, replacement: Replacement) {
  if (search instanceof RegExp) {
    if (!search.global) throw new TypeError("replaceAll requires a global regular expression.");
    return value.replace(search, replacement as string);
  }

  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(escaped, "g"), replacement as string);
}

export function fromEntriesCompat<T>(entries: Iterable<readonly [PropertyKey, T]>) {
  const result: Record<PropertyKey, T> = {};
  for (const [key, value] of entries) result[key] = value;
  return result;
}

if (typeof String.prototype.replaceAll !== "function") {
  Object.defineProperty(String.prototype, "replaceAll", {
    configurable: true,
    writable: true,
    value(this: string, search: string | RegExp, replacement: Replacement) {
      return replaceAllCompat(String(this), search, replacement);
    }
  });
}

if (typeof Object.fromEntries !== "function") {
  Object.defineProperty(Object, "fromEntries", {
    configurable: true,
    writable: true,
    value: fromEntriesCompat
  });
}
