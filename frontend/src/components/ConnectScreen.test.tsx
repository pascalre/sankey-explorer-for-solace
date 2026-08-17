import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectScreen } from "./ConnectScreen";
import { api, ApiRequestError } from "../api/client";
import type { BrokerConfigEntry } from "../lib/brokerConfig";
import type { BrokerConnectionStatus } from "../types";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: { ...actual.api, connect: vi.fn(), disconnectOne: vi.fn() },
  };
});

beforeEach(() => {
  vi.mocked(api.connect).mockReset();
  vi.mocked(api.disconnectOne).mockReset();
});

const brokerA: BrokerConnectionStatus = {
  id: "a",
  label: "Broker-A",
  vpn: "default",
  baseUrl: "http://localhost:8080/SEMP",
  connectedAt: 0,
};

const brokerAConfig: BrokerConfigEntry = {
  baseUrl: brokerA.baseUrl,
  vpn: brokerA.vpn,
  username: "ro-user",
  password: "secret",
  label: brokerA.label,
};

/** Defaults for the props every ConnectScreen render needs. */
function renderConnectScreen(props: Partial<React.ComponentProps<typeof ConnectScreen>> = {}) {
  return render(
    <ConnectScreen
      brokers={[]}
      onBrokersChanged={vi.fn()}
      brokerConfigs={new Map()}
      onBrokerConfigsChanged={vi.fn()}
      onDone={vi.fn()}
      {...props}
    />,
  );
}

describe("ConnectScreen - first connection (no brokers yet)", () => {
  it("shows the 'Connect to Message VPN' heading and no broker list", () => {
    renderConnectScreen();

    expect(screen.getByText("Connect to Message VPN")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText("View diagram")).not.toBeInTheDocument();
  });

  it("submits the form, calls onBrokersChanged, and records the config for export", async () => {
    vi.mocked(api.connect).mockResolvedValue([brokerA]);
    const onBrokersChanged = vi.fn();
    const onBrokerConfigsChanged = vi.fn();
    const user = userEvent.setup();

    renderConnectScreen({ onBrokersChanged, onBrokerConfigsChanged });
    await user.type(screen.getByLabelText("Username"), "ro");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(api.connect).toHaveBeenCalledWith(
      expect.objectContaining({ username: "ro", password: "secret" }),
    );
    expect(onBrokersChanged).toHaveBeenCalledWith([brokerA]);
    expect(onBrokerConfigsChanged).toHaveBeenCalledWith(
      new Map([
        [
          "a",
          expect.objectContaining({ username: "ro", password: "secret" }),
        ],
      ]),
    );
  });

  it("shows the server's error message on a failed connect", async () => {
    vi.mocked(api.connect).mockRejectedValue(
      new ApiRequestError("Could not connect - check URL, VPN and credentials"),
    );
    const user = userEvent.setup();

    renderConnectScreen();
    await user.type(screen.getByLabelText("Username"), "ro");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText("Could not connect - check URL, VPN and credentials"),
    ).toBeInTheDocument();
  });
});

describe("ConnectScreen - config file export", () => {
  it("is disabled when no connection's config is available", () => {
    renderConnectScreen();

    expect(screen.getByRole("button", { name: "Export config" })).toBeDisabled();
  });

  it("downloads the config of every connected broker as one YAML file", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const brokerB: BrokerConnectionStatus = { ...brokerA, id: "b", label: "Broker-B" };
    const brokerBConfig: BrokerConfigEntry = { ...brokerAConfig, username: "u2", label: "Broker-B" };
    renderConnectScreen({
      brokers: [brokerA, brokerB],
      brokerConfigs: new Map([
        ["a", brokerAConfig],
        ["b", brokerBConfig],
      ]),
    });

    await user.click(screen.getByRole("button", { name: "Export config" }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const text = await blob.text();
    expect(text).toContain("username: ro-user");
    expect(text).toContain("username: u2");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("only exports connections whose config is known, and hints at the rest", () => {
    const brokerB: BrokerConnectionStatus = { ...brokerA, id: "b", label: "Broker-B" };
    renderConnectScreen({
      brokers: [brokerA, brokerB],
      brokerConfigs: new Map([["a", brokerAConfig]]),
    });

    expect(screen.getByRole("button", { name: "Export config" })).toBeEnabled();
    expect(screen.getByText(/aren't included/)).toBeInTheDocument();
  });
});

describe("ConnectScreen - config file import", () => {
  function makeFile(contents: string) {
    return new File([contents], "config.yaml", { type: "application/x-yaml" });
  }

  it("connects to every broker listed in the imported file", async () => {
    vi.mocked(api.connect)
      .mockResolvedValueOnce([brokerA])
      .mockResolvedValueOnce([brokerA, { ...brokerA, id: "b", label: "Broker-B" }]);
    const onBrokersChanged = vi.fn();
    const onBrokerConfigsChanged = vi.fn();
    const user = userEvent.setup();

    renderConnectScreen({ onBrokersChanged, onBrokerConfigsChanged });
    const file = makeFile(
      "brokers:\n" +
        "  - baseUrl: http://a:8080/SEMP\n    vpn: v1\n    username: u1\n    password: p1\n    label: Broker-A\n" +
        "  - baseUrl: http://b:8080/SEMP\n    vpn: v2\n    username: u2\n    password: p2\n    label: Broker-B\n",
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(api.connect).toHaveBeenCalledTimes(2);
    expect(api.connect).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ username: "u1", label: "Broker-A" }),
    );
    expect(onBrokersChanged).toHaveBeenLastCalledWith([
      brokerA,
      { ...brokerA, id: "b", label: "Broker-B" },
    ]);
    expect(onBrokerConfigsChanged).toHaveBeenLastCalledWith(
      new Map([
        ["a", expect.objectContaining({ username: "u1", label: "Broker-A" })],
        ["b", expect.objectContaining({ username: "u2", label: "Broker-B" })],
      ]),
    );
  });

  it("shows an error and does not call the API for an invalid file", async () => {
    const user = userEvent.setup();

    renderConnectScreen();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile("not: {valid"));

    expect(await screen.findByText("Not a valid YAML file")).toBeInTheDocument();
    expect(api.connect).not.toHaveBeenCalled();
  });

  it("reports per-entry failures but still applies successful connections", async () => {
    vi.mocked(api.connect)
      .mockRejectedValueOnce(new ApiRequestError("bad credentials"))
      .mockResolvedValueOnce([brokerA]);
    const onBrokersChanged = vi.fn();
    const user = userEvent.setup();

    renderConnectScreen({ onBrokersChanged });
    const file = makeFile(
      "brokers:\n" +
        "  - baseUrl: http://a:8080/SEMP\n    vpn: v1\n    username: u1\n    password: p1\n    label: Bad-Broker\n" +
        "  - baseUrl: http://b:8080/SEMP\n    vpn: v2\n    username: u2\n    password: p2\n    label: Broker-A\n",
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(await screen.findByText(/Bad-Broker: bad credentials/)).toBeInTheDocument();
    expect(onBrokersChanged).toHaveBeenCalledWith([brokerA]);
  });
});

describe("ConnectScreen - managing existing connections", () => {
  it("shows the broker list and switches to 'Manage' heading / 'Add Message VPN' button", () => {
    renderConnectScreen({ brokers: [brokerA] });

    expect(screen.getByText("Manage Message VPN connections")).toBeInTheDocument();
    expect(screen.getByText("Broker-A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Message VPN" })).toBeInTheDocument();
  });

  it("shows a 'View diagram' button that calls onDone", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();

    renderConnectScreen({ brokers: [brokerA], onDone });
    await user.click(screen.getByRole("button", { name: "View diagram" }));

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("removes a broker, calls onBrokersChanged, and drops its config", async () => {
    vi.mocked(api.disconnectOne).mockResolvedValue([]);
    const onBrokersChanged = vi.fn();
    const onBrokerConfigsChanged = vi.fn();
    const user = userEvent.setup();

    renderConnectScreen({
      brokers: [brokerA],
      brokerConfigs: new Map([["a", brokerAConfig]]),
      onBrokersChanged,
      onBrokerConfigsChanged,
    });
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(api.disconnectOne).toHaveBeenCalledWith("a");
    expect(onBrokersChanged).toHaveBeenCalledWith([]);
    expect(onBrokerConfigsChanged).toHaveBeenCalledWith(new Map());
  });
});
