/**
 * Node IDs in the Sankey are full prefix paths (e.g. "acme/sales"), so that
 * identical prefixes from different hierarchies correctly merge (see
 * explodeTopicHierarchy.ts). For the OVERVIEW display, though, only the
 * last segment should be shown - this function separates the two concerns.
 *
 * Note: in focus mode (a node is selected), SankeyChart shows the full id
 * instead of calling this function, since there are far fewer nodes on
 * screen and the full path is exactly what the user clicked for.
 */
export function nodeDisplayLabel(id: string): string {
  const segments = id.split("/");
  const last = segments[segments.length - 1];
  return last ? last : id;
}
