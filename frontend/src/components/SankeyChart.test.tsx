import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SankeyChart } from "./SankeyChart";
import type { SankeyEdge } from "../lib/toSankeyEdges";

const basicEdges: SankeyEdge[] = [
  { source: "acme/sales", target: "Queue: orders-q", value: 1 },
];

describe("SankeyChart - empty state", () => {
  it("shows a helpful message instead of an empty diagram when there are no edges", () => {
    render(<SankeyChart edges={[]} />);
    expect(screen.getByText(/No topic subscriptions found/)).toBeInTheDocument();
  });
});

describe("SankeyChart - labels", () => {
  it("shows the last path segment for topic hierarchy nodes, not the full path", () => {
    render(<SankeyChart edges={basicEdges} />);
    expect(screen.getByText("sales")).toBeInTheDocument();
    expect(screen.queryByText("acme/sales")).not.toBeInTheDocument();
  });

  it("shows the bare endpoint name without the 'Queue: ' prefix, plus a 'Queue' type sub-label", () => {
    render(<SankeyChart edges={basicEdges} />);
    expect(screen.getByText("orders-q")).toBeInTheDocument();
    expect(screen.queryByText("Queue: orders-q")).not.toBeInTheDocument();
    expect(screen.getByText("Queue")).toBeInTheDocument();
  });

  it("renders a direct subscriber node with its own type sub-label, distinct from a queue", () => {
    render(
      <SankeyChart
        edges={[{ source: "acme/sales", target: "Direct Subscriber: my-app-1", value: 1 }]}
      />,
    );
    expect(screen.getByText("my-app-1")).toBeInTheDocument();
    expect(screen.getByText("Direct Subscriber")).toBeInTheDocument();
  });

  it("shows the owner sub-label when provided", () => {
    render(
      <SankeyChart
        edges={basicEdges}
        endpointOwners={new Map([["Queue: orders-q", "app-svc-orders"]])}
      />,
    );
    expect(screen.getByText("app-svc-orders")).toBeInTheDocument();
  });

  it("does not show a vpn/host sub-label when only one message VPN is in play", () => {
    render(
      <SankeyChart
        edges={basicEdges}
        endpointBrokerColors={{ colorByEndpointLabel: new Map(), brokerCount: 1 }}
        endpointVpnHost={new Map([["Queue: orders-q", "default at localhost:8080"]])}
      />,
    );
    expect(screen.queryByText("default at localhost:8080")).not.toBeInTheDocument();
  });

  it("shows the vpn/host sub-label once multiple message VPNs are connected", () => {
    render(
      <SankeyChart
        edges={basicEdges}
        endpointBrokerColors={{ colorByEndpointLabel: new Map(), brokerCount: 2 }}
        endpointVpnHost={new Map([["Queue: orders-q", "default at localhost:8080"]])}
      />,
    );
    expect(screen.getByText("default at localhost:8080")).toBeInTheDocument();
  });
});

describe("SankeyChart - sort control", () => {
  it("offers all five sort modes", () => {
    render(<SankeyChart edges={basicEdges} />);
    const select = screen.getByLabelText("Sort by") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual([
      "Topic name",
      "Endpoint",
      "Owner",
      "Message VPN",
      "Crossing minimized",
    ]);
  });

  it("switching sort mode does not crash and keeps the diagram rendered", async () => {
    const user = userEvent.setup();
    render(<SankeyChart edges={basicEdges} />);

    await user.selectOptions(screen.getByLabelText("Sort by"), "Crossing minimized");

    expect(screen.getByText("orders-q")).toBeInTheDocument();
  });
});

describe("SankeyChart - click to filter", () => {
  it("clicking a node shows 'Back to overview', clicking that hides it again", async () => {
    const user = userEvent.setup();
    render(<SankeyChart edges={basicEdges} />);

    expect(screen.queryByRole("button", { name: "Back to overview" })).not.toBeInTheDocument();

    await user.click(screen.getByText("orders-q"));
    const backButton = await screen.findByRole("button", { name: "Back to overview" });
    expect(backButton).toBeInTheDocument();

    await user.click(backButton);
    expect(screen.queryByRole("button", { name: "Back to overview" })).not.toBeInTheDocument();
  });

  it("clicking a queue keeps that queue's own subscription chain visible", async () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales", target: "Queue: orders-q", value: 1 },
      { source: "acme/support", target: "Queue: tickets-q", value: 1 },
    ];
    const user = userEvent.setup();
    render(<SankeyChart edges={edges} />);

    await user.click(screen.getByText("orders-q"));

    expect(screen.getByText("orders-q")).toBeInTheDocument();
    expect(screen.queryByText("tickets-q")).not.toBeInTheDocument();
  });
});

describe("SankeyChart - wildcard subscription coverage", () => {
  it("shows a broader wildcard subscriber when filtering down to a more specific, separately-subscribed topic", async () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/>", target: "Queue: all-sales-q", value: 1 },
      { source: "acme/sales/orders", target: "Topic Endpoint: te-orders", value: 1 },
    ];
    const user = userEvent.setup();
    render(<SankeyChart edges={edges} />);

    // Before filtering, both endpoints are already visible (the fan-out
    // from "acme/sales/orders" now includes the queue too, on top of its
    // own directly-subscribed topic-endpoint).
    expect(screen.getByText("all-sales-q")).toBeInTheDocument();
    expect(screen.getByText("te-orders")).toBeInTheDocument();

    await user.click(screen.getByText("orders"));

    // Filtering down to the specific topic must still show the queue that
    // only reaches it via its broader "acme/sales/>" wildcard - that's the
    // whole point of the fix.
    expect(screen.getByText("all-sales-q")).toBeInTheDocument();
    expect(screen.getByText("te-orders")).toBeInTheDocument();
  });
});

describe("SankeyChart - view mode toggle", () => {
  const wildcardEdges: SankeyEdge[] = [
    { source: "acme/sales/>", target: "Queue: all-sales-q", value: 1 },
    { source: "acme/sales/orders", target: "Topic Endpoint: te-orders", value: 1 },
  ];

  it("offers both view modes, defaulting to 'Data flow'", () => {
    render(<SankeyChart edges={wildcardEdges} />);
    const select = screen.getByLabelText("View") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(["Data flow (wildcard-aware)", "Subscriptions (literal)"]);
    expect(select.value).toBe("dataflow");
  });

  it("'Data flow' mode (default) shows the implied wildcard-covered endpoint even without filtering", () => {
    render(<SankeyChart edges={wildcardEdges} />);
    expect(screen.getByText("all-sales-q")).toBeInTheDocument();
    expect(screen.getByText("te-orders")).toBeInTheDocument();
  });

  it("switching to 'Subscriptions' mode shows only the literal, declared subscriptions - no implied wildcard coverage", async () => {
    const user = userEvent.setup();
    render(<SankeyChart edges={wildcardEdges} />);

    await user.selectOptions(screen.getByLabelText("View"), "Subscriptions (literal)");

    // Both endpoints still exist (each has its own real subscription)...
    expect(screen.getByText("all-sales-q")).toBeInTheDocument();
    expect(screen.getByText("te-orders")).toBeInTheDocument();
    // ...but the ">" wildcard segment node (acme/sales/>) must no longer
    // fan out to the "orders" topic node's queue - i.e. clicking "orders"
    // in literal mode must NOT reveal the queue reached only via wildcard.
    await user.click(screen.getByText("orders"));
    expect(screen.queryByText("all-sales-q")).not.toBeInTheDocument();
    expect(screen.getByText("te-orders")).toBeInTheDocument();
  });

  it("switching view mode resets any active node selection", async () => {
    const user = userEvent.setup();
    render(<SankeyChart edges={wildcardEdges} />);

    await user.click(screen.getByText("orders"));
    expect(await screen.findByRole("button", { name: "Back to overview" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("View"), "Subscriptions (literal)");
    expect(screen.queryByRole("button", { name: "Back to overview" })).not.toBeInTheDocument();
  });
});

describe("SankeyChart - show direct subscribers toggle", () => {
  const mixedEdges: SankeyEdge[] = [
    { source: "acme/sales", target: "Queue: orders-q", value: 1 },
    { source: "acme/sales", target: "Direct Subscriber: my-app-1", value: 1 },
  ];

  it("is checked by default, showing direct subscribers alongside other endpoints", () => {
    render(<SankeyChart edges={mixedEdges} />);
    const checkbox = screen.getByLabelText("Show direct subscribers") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText("orders-q")).toBeInTheDocument();
    expect(screen.getByText("my-app-1")).toBeInTheDocument();
  });

  it("unchecking it hides direct-subscriber nodes but keeps queues/topic-endpoints", async () => {
    const user = userEvent.setup();
    render(<SankeyChart edges={mixedEdges} />);

    await user.click(screen.getByLabelText("Show direct subscribers"));

    expect(screen.getByText("orders-q")).toBeInTheDocument();
    expect(screen.queryByText("my-app-1")).not.toBeInTheDocument();
  });

  it("re-checking it brings direct subscribers back", async () => {
    const user = userEvent.setup();
    render(<SankeyChart edges={mixedEdges} />);

    const checkbox = screen.getByLabelText("Show direct subscribers");
    await user.click(checkbox);
    expect(screen.queryByText("my-app-1")).not.toBeInTheDocument();

    await user.click(checkbox);
    expect(screen.getByText("my-app-1")).toBeInTheDocument();
  });

  it("toggling it resets any active node selection", async () => {
    const user = userEvent.setup();
    render(<SankeyChart edges={mixedEdges} />);

    await user.click(screen.getByText("orders-q"));
    expect(await screen.findByRole("button", { name: "Back to overview" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Show direct subscribers"));
    expect(screen.queryByRole("button", { name: "Back to overview" })).not.toBeInTheDocument();
  });
});

describe("SankeyChart - svg structure", () => {
  it("renders an accessible svg with the expected aria-label", () => {
    render(<SankeyChart edges={basicEdges} />);
    const svg = screen.getByRole("img", { name: "Topic to endpoint Sankey diagram" });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    // Sanity check there are actual node rects drawn, not just an empty svg.
    expect(within(svg).getAllByText("orders-q").length).toBeGreaterThan(0);
  });
});

describe("SankeyChart - SVG export", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads a standalone, background-filled copy of the live diagram", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<SankeyChart edges={basicEdges} />);
    await user.click(screen.getByRole("button", { name: "Export as SVG" }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("image/svg+xml");
    const text = await blob.text();
    expect(text).toContain("<svg");
    expect(text).toContain('fill="#093B5F"'); // the added standalone background
    expect(text).toContain("orders-q");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    clickSpy.mockRestore();
  });
});
