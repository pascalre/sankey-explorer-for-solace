import type { EndpointInfo } from "../types";
import { buildEndpointLabelMap } from "./buildEndpointLabelMap";

/**
 * Solace Brand Book 2025 v3.0, p.17. Deliberately excludes:
 * - #C2F7FF (light blue tint) - already used for topic/hierarchy nodes,
 *   reusing it for a broker-colored endpoint would blur that distinction.
 * - #08223C / #093B5F (backgrounds/panels) - too low-contrast as a fill.
 */
const BROKER_COLOR_PALETTE = [
  "#00C895", // Classic Green - 01
  "#FCA829", // Secondary Orange
  "#ABFF88", // Bright Green - 02
  "#009193", // Secondary Deep Green
  "#FFF7C2", // Secondary Light Yellow tint
  "#C7FFCB", // Secondary Light Green tint
];

/** Assigns each distinct label a color, in first-seen order, cycling the palette if needed. */
export function buildBrokerColorPalette(brokerLabelsInOrder: string[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const label of brokerLabelsInOrder) {
    if (!colors.has(label)) {
      colors.set(label, BROKER_COLOR_PALETTE[colors.size % BROKER_COLOR_PALETTE.length]);
    }
  }
  return colors;
}

export interface EndpointBrokerColors {
  /** Sankey node label (e.g. "Queue: orders-q (EU-Broker)") -> hex color. */
  colorByEndpointLabel: Map<string, string>;
  /** Number of distinct brokers in this dataset - callers use this to decide
   *  whether to color endpoints by broker at all (only worth it with 2+). */
  brokerCount: number;
}

export function buildEndpointBrokerColors(endpoints: EndpointInfo[]): EndpointBrokerColors {
  const brokerPalette = buildBrokerColorPalette(endpoints.map((e) => e.brokerLabel));
  const colorByEndpointLabel = buildEndpointLabelMap(endpoints, (e) =>
    brokerPalette.get(e.brokerLabel),
  );

  return { colorByEndpointLabel, brokerCount: brokerPalette.size };
}
