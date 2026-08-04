import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { api, ApiRequestError } from "./api/client";
import type { EndpointInfo, SessionInfo } from "./types";

vi.mock("./api/client", async () => {
  const actual = await vi.importActual<typeof import("./api/client")>("./api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      getSession: vi.fn(),
      getEndpoints: vi.fn(),
      logout: vi.fn(),
      disconnectAll: vi.fn(),
    },
  };
});

function session(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return { authRequired: false, authenticated: true, brokers: [], ...overrides };
}

const oneEndpoint: EndpointInfo[] = [
  {
    type: "queue",
    name: "orders-q",
    vpn: "default",
    subscriptions: ["orders/created"],
    brokerLabel: "default",
    brokerHost: "localhost:8080",
  },
];

const connectedBroker = {
  id: "1",
  label: "default",
  vpn: "default",
  baseUrl: "http://localhost:8080/SEMP",
  connectedAt: 0,
};

describe("App - initial routing based on session", () => {
  it("shows the login screen when auth is required and not yet authenticated", async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session({ authRequired: true, authenticated: false }),
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("shows the connect screen when no message VPN is connected", async () => {
    vi.mocked(api.getSession).mockResolvedValue(session({ brokers: [] }));

    render(<App />);

    expect(await screen.findByText("Connect to Message VPN")).toBeInTheDocument();
  });

  it("loads endpoints and shows the diagram when a broker is already connected", async () => {
    vi.mocked(api.getSession).mockResolvedValue(session({ brokers: [connectedBroker] }));
    vi.mocked(api.getEndpoints).mockResolvedValue(oneEndpoint);

    render(<App />);

    expect(await screen.findByText("orders-q")).toBeInTheDocument();
  });

  it("shows an error screen with a retry button when the session request fails", async () => {
    vi.mocked(api.getSession).mockRejectedValue(new ApiRequestError("network down"));

    render(<App />);

    expect(await screen.findByText("network down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("App - topbar actions once connected", () => {
  it("shows one badge per connected broker", async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session({ brokers: [connectedBroker, { ...connectedBroker, id: "2", label: "second" }] }),
    );
    vi.mocked(api.getEndpoints).mockResolvedValue(oneEndpoint);

    render(<App />);
    await screen.findByText("orders-q");

    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("'Manage Message VPNs' switches back to the connect screen", async () => {
    vi.mocked(api.getSession).mockResolvedValue(session({ brokers: [connectedBroker] }));
    vi.mocked(api.getEndpoints).mockResolvedValue(oneEndpoint);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("orders-q");

    await user.click(screen.getByRole("button", { name: "Manage Message VPNs" }));

    expect(await screen.findByText("Manage Message VPN connections")).toBeInTheDocument();
  });

  it("'Disconnect all Message VPNs' clears brokers and returns to the connect screen", async () => {
    vi.mocked(api.getSession).mockResolvedValue(session({ brokers: [connectedBroker] }));
    vi.mocked(api.getEndpoints).mockResolvedValue(oneEndpoint);
    vi.mocked(api.disconnectAll).mockResolvedValue([]);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("orders-q");

    await user.click(screen.getByRole("button", { name: "Disconnect all Message VPNs" }));

    expect(await screen.findByText("Connect to Message VPN")).toBeInTheDocument();
    expect(api.disconnectAll).toHaveBeenCalledOnce();
  });

  it("'Refresh' reloads endpoints and shows a banner if it fails", async () => {
    vi.mocked(api.getSession).mockResolvedValue(session({ brokers: [connectedBroker] }));
    vi.mocked(api.getEndpoints)
      .mockResolvedValueOnce(oneEndpoint)
      .mockRejectedValueOnce(new ApiRequestError("broker unreachable"));
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("orders-q");

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("broker unreachable")).toBeInTheDocument();
    // The previously loaded diagram must still be visible - a failed
    // refresh shouldn't blank out data the user already had.
    expect(screen.getByText("orders-q")).toBeInTheDocument();
  });

  it("shows a 'Logout' button only when login is required, and calls api.logout", async () => {
    vi.mocked(api.getSession)
      .mockResolvedValueOnce(
        session({ authRequired: true, authenticated: true, brokers: [connectedBroker] }),
      )
      .mockResolvedValueOnce(session({ authRequired: true, authenticated: false }));
    vi.mocked(api.getEndpoints).mockResolvedValue(oneEndpoint);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("orders-q");

    const logoutButton = screen.getByRole("button", { name: "Logout" });
    await user.click(logoutButton);

    expect(api.logout).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument(),
    );
  });
});
