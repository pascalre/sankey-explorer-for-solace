import { sankey, type SankeyGraph } from "d3-sankey";
import type { SankeyEdge } from "./toSankeyEdges";
import { removeCycles } from "./removeCycles";
import { buildQueueSortKeys } from "./buildQueueSortKeys";
import { nodeDisplayLabel } from "./nodeDisplayLabel";
import { endpointDisplayName } from "./endpointDisplayName";
import { endpointTypeLabel, isEndpointNode } from "./nodeKind";

export type SortMode = "topic" | "queue" | "owner" | "messageVpn" | "crossing";

// Space Mono (the font labels render in - see SankeyChart) is monospace,
// so character width is predictable: roughly 0.6x the font size. A little
// generous on purpose - underestimating re-introduces the clipping bug.
const MAIN_FONT_SIZE = 12;
const SUB_FONT_SIZE = 10; // type/owner/vpn@host sub-labels render smaller
const CHAR_WIDTH_RATIO = 0.65;
const LABEL_GAP_PX = 14; // gap between the bar and the start of the text

function estimateWidth(text: string, fontSize: number): number {
  return text.length * fontSize * CHAR_WIDTH_RATIO + LABEL_GAP_PX;
}

/**
 * Reserved horizontal space on each side so the outermost columns' labels
 * (which sit outside their bar - see SankeyChart) have room instead of
 * being clipped by the SVG's own edge (SVG clips overflowing content by
 * default). Previously a fixed cap (130px) regardless of actual label
 * length - which is exactly what clipped real queue names like
 * "Queue: RDP_to_Mobiles..." down to ~18 characters. Now sized to the
 * longest label actually in this dataset instead of a guessed constant.
 *
 * Endpoint nodes can render up to four stacked lines (name, type, owner,
 * vpn@host - see SankeyChart), any of which might be the widest, so all
 * four are measured. Non-endpoint (topic hierarchy) nodes only ever show
 * one line (their last path segment).
 */
function computeLabelMargins(
  nodeIds: string[],
  width: number,
  endpointOwners?: Map<string, string>,
  endpointVpnHost?: Map<string, string>,
): { left: number; right: number } {
  let maxLeftWidth = 0;
  let maxRightWidth = 0;

  for (const id of nodeIds) {
    if (isEndpointNode(id)) {
      const lineWidths = [estimateWidth(endpointDisplayName(id), MAIN_FONT_SIZE)];

      const type = endpointTypeLabel(id);
      if (type) lineWidths.push(estimateWidth(type, SUB_FONT_SIZE));

      const owner = endpointOwners?.get(id);
      if (owner) lineWidths.push(estimateWidth(owner, SUB_FONT_SIZE));

      const vpnHost = endpointVpnHost?.get(id);
      if (vpnHost) lineWidths.push(estimateWidth(vpnHost, SUB_FONT_SIZE));

      maxRightWidth = Math.max(maxRightWidth, ...lineWidths);
    } else {
      maxLeftWidth = Math.max(
        maxLeftWidth,
        estimateWidth(nodeDisplayLabel(id), MAIN_FONT_SIZE),
      );
    }
  }

  // Cap at 40% of width each so one absurdly long label can't crush the
  // diagram itself down to nothing - still bigger than before, just not
  // unbounded.
  const cap = width * 0.4;
  const left = Math.max(20, Math.min(cap, maxLeftWidth));
  const right = Math.max(20, Math.min(cap, maxRightWidth));
  return { left, right };
}

export interface SankeyNodeDatum {
  id: string;
}

export interface SankeyLinkDatum {
  source: string;
  target: string;
  value: number;
}

export function computeSankeyLayout(
  edges: SankeyEdge[],
  width: number,
  height: number,
  sortMode: SortMode = "topic",
  endpointOwners?: Map<string, string>,
  endpointBrokerLabels?: Map<string, string>,
  endpointVpnHost?: Map<string, string>,
): SankeyGraph<SankeyNodeDatum, SankeyLinkDatum> {
  const { acyclicEdges, removedEdges } = removeCycles(edges);
  if (removedEdges.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `Sankey: removed ${removedEdges.length} edge(s) due to a cycle (d3-sankey requires an acyclic graph). ` +
        "Usually a name collision between a topic string and an endpoint label:",
      removedEdges,
    );
  }

  const nodeIds = new Set<string>();
  for (const edge of acyclicEdges) {
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  }

  // d3-sankey crashes with "RangeError: Invalid array length" when nodes=[]
  // is passed to sankey() (internally: d3.max([]) -> undefined -> NaN ->
  // new Array(NaN)). Empty input is a valid state (e.g. endpoints with no
  // subscriptions at all), not an error - so bail out early with an empty
  // graph BEFORE calling sankey().
  if (nodeIds.size === 0) {
    return { nodes: [], links: [] };
  }

  const graph: SankeyGraph<SankeyNodeDatum, SankeyLinkDatum> = {
    nodes: [...nodeIds].map((id) => ({ id })),
    links: acyclicEdges.map((e) => ({
      source: e.source,
      target: e.target,
      value: e.value,
    })),
  };

  const sortKeys =
    sortMode === "queue"
      ? buildQueueSortKeys(acyclicEdges)
      : sortMode === "owner"
        ? buildQueueSortKeys(acyclicEdges, (id) => endpointOwners?.get(id) ?? "")
        : sortMode === "messageVpn"
          ? buildQueueSortKeys(acyclicEdges, (id) => endpointBrokerLabels?.get(id) ?? "")
          : null;

  const { left: leftMargin, right: rightMargin } = computeLabelMargins(
    [...nodeIds],
    width,
    endpointOwners,
    endpointVpnHost,
  );

  const layout = sankey<SankeyNodeDatum, SankeyLinkDatum>()
    .nodeId((d) => d.id)
    .nodeWidth(14)
    .nodePadding(10)
    // "crossing" mode: pass undefined explicitly, which is d3-sankey's own
    // default - "automatic layout using graph topology to minimize
    // crossings". Every other mode overrides it with our own alphabetical
    // (or derived-key) comparator, because the user wants to scan nodes
    // per column consistently top-to-bottom rather than topology-sorted.
    .nodeSort(
      sortMode === "crossing"
        ? undefined
        : (a, b) => {
            if (sortKeys) {
              const keyA = sortKeys.get(a.id) ?? a.id;
              const keyB = sortKeys.get(b.id) ?? b.id;
              const cmp = keyA.localeCompare(keyB);
              if (cmp !== 0) return cmp;
            }
            return a.id.localeCompare(b.id);
          },
    )
    .extent([
      [leftMargin, 1],
      [Math.max(width - rightMargin, leftMargin + 2), Math.max(height - 1, 2)],
    ]);

  return layout(graph);
}
