import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectScreen } from "./ConnectScreen";
import { api, ApiRequestError } from "../api/client";
import type { BrokerConnectionStatus } from "../types";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: { ...actual.api, connect: vi.fn(), disconnectOne: vi.fn() },
  };
});

const brokerA: BrokerConnectionStatus = {
  id: "a",
  label: "Broker-A",
  vpn: "default",
  baseUrl: "http://localhost:8080/SEMP",
  connectedAt: 0,
};

describe("ConnectScreen - first connection (no brokers yet)", () => {
  it("shows the 'Connect to Message VPN' heading and no broker list", () => {
    render(<ConnectScreen brokers={[]} onBrokersChanged={vi.fn()} onDone={vi.fn()} />);

    expect(screen.getByText("Connect to Message VPN")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText("View diagram")).not.toBeInTheDocument();
  });

  it("submits the form and calls onBrokersChanged with the updated list", async () => {
    vi.mocked(api.connect).mockResolvedValue([brokerA]);
    const onBrokersChanged = vi.fn();
    const user = userEvent.setup();

    render(<ConnectScreen brokers={[]} onBrokersChanged={onBrokersChanged} onDone={vi.fn()} />);
    await user.type(screen.getByLabelText("Username"), "ro");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Connect \u2192" }));

    expect(api.connect).toHaveBeenCalledWith(
      expect.objectContaining({ username: "ro", password: "secret" }),
    );
    expect(onBrokersChanged).toHaveBeenCalledWith([brokerA]);
  });

  it("shows the server's error message on a failed connect", async () => {
    vi.mocked(api.connect).mockRejectedValue(
      new ApiRequestError("Could not connect - check URL, VPN and credentials"),
    );
    const user = userEvent.setup();

    render(<ConnectScreen brokers={[]} onBrokersChanged={vi.fn()} onDone={vi.fn()} />);
    await user.type(screen.getByLabelText("Username"), "ro");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Connect \u2192" }));

    expect(
      await screen.findByText("Could not connect - check URL, VPN and credentials"),
    ).toBeInTheDocument();
  });
});

describe("ConnectScreen - managing existing connections", () => {
  it("shows the broker list and switches to 'Manage' heading / 'Add Message VPN' button", () => {
    render(
      <ConnectScreen brokers={[brokerA]} onBrokersChanged={vi.fn()} onDone={vi.fn()} />,
    );

    expect(screen.getByText("Manage Message VPN connections")).toBeInTheDocument();
    expect(screen.getByText("Broker-A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Message VPN" })).toBeInTheDocument();
  });

  it("shows a 'View diagram' button that calls onDone", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();

    render(<ConnectScreen brokers={[brokerA]} onBrokersChanged={vi.fn()} onDone={onDone} />);
    await user.click(screen.getByRole("button", { name: "View diagram" }));

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("removes a broker and calls onBrokersChanged with the updated list", async () => {
    vi.mocked(api.disconnectOne).mockResolvedValue([]);
    const onBrokersChanged = vi.fn();
    const user = userEvent.setup();

    render(
      <ConnectScreen brokers={[brokerA]} onBrokersChanged={onBrokersChanged} onDone={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(api.disconnectOne).toHaveBeenCalledWith("a");
    expect(onBrokersChanged).toHaveBeenCalledWith([]);
  });
});
