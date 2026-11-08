import type { ContentRef } from "./types.js";

/** A source of candidate content, e.g. "issue remote links" or "CQL search". */
export interface Resolver<I> {
  name: string;
  /** Lower runs as more trusted. Used to rank merged results. */
  priority: number;
  resolve(input: I): Promise<Array<Omit<ContentRef, "via" | "rank">>>;
}

export interface ResolveResult {
  refs: ContentRef[];
  /** Resolvers that failed; the others still contribute. */
  errors: Array<{ resolver: string; error: unknown }>;
}

/**
 * Run all resolvers in parallel and merge results by id.
 * A ref found by several resolvers keeps the best rank and lists every resolver in `via`.
 */
export async function resolveLinkedContent<I>(
  input: I,
  resolvers: Resolver<I>[],
  opts: { limit?: number } = {},
): Promise<ResolveResult> {
  const ordered = [...resolvers].sort((a, b) => a.priority - b.priority);
  const settled = await Promise.allSettled(ordered.map((r) => r.resolve(input)));

  const byId = new Map<string, ContentRef>();
  const errors: ResolveResult["errors"] = [];

  settled.forEach((result, i) => {
    const resolver = ordered[i]!;
    if (result.status === "rejected") {
      errors.push({ resolver: resolver.name, error: result.reason });
      return;
    }
    for (const ref of result.value) {
      const existing = byId.get(ref.id);
      if (existing) {
        if (!existing.via.includes(resolver.name)) existing.via.push(resolver.name);
        existing.title ??= ref.title;
        existing.url ??= ref.url;
      } else {
        byId.set(ref.id, { ...ref, via: [resolver.name], rank: resolver.priority });
      }
    }
  });

  // Found by more resolvers = more confident; break rank ties with that.
  const refs = [...byId.values()].sort((a, b) => a.rank - b.rank || b.via.length - a.via.length);
  return { refs: opts.limit ? refs.slice(0, opts.limit) : refs, errors };
}
