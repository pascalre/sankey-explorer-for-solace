import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginScreen } from "./LoginScreen";
import { api, ApiRequestError } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: { ...actual.api, login: vi.fn() },
  };
});

describe("LoginScreen", () => {
  it("calls onLoggedIn after a successful login", async () => {
    vi.mocked(api.login).mockResolvedValue({ authenticated: true });
    const onLoggedIn = vi.fn();
    const user = userEvent.setup();

    render(<LoginScreen onLoggedIn={onLoggedIn} />);
    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(api.login).toHaveBeenCalledWith("admin", "secret");
    expect(onLoggedIn).toHaveBeenCalledOnce();
  });

  it("shows the server's error message and does not call onLoggedIn on failure", async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiRequestError("Invalid credentials"));
    const onLoggedIn = vi.fn();
    const user = userEvent.setup();

    render(<LoginScreen onLoggedIn={onLoggedIn} />);
    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a non-ApiRequestError failure", async () => {
    vi.mocked(api.login).mockRejectedValue(new Error("network exploded"));
    const user = userEvent.setup();

    render(<LoginScreen onLoggedIn={vi.fn()} />);
    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "x");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Login failed")).toBeInTheDocument();
  });

  it("disables the submit button and shows a checking state while submitting", async () => {
    let resolveLogin!: (value: { authenticated: boolean }) => void;
    vi.mocked(api.login).mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    const user = userEvent.setup();

    render(<LoginScreen onLoggedIn={vi.fn()} />);
    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "x");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    const button = screen.getByRole("button", { name: "Checking..." });
    expect(button).toBeDisabled();

    resolveLogin({ authenticated: true });
  });
});
