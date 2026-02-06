import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import Page from "@/app/login/page";
import { login } from "@/components/actions/login-action";

jest.mock("../components/actions/login-action", () => ({
  login: jest.fn(),
}));

describe("Login Page", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_DEV_LOGIN_PREFILL;
    delete process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL;
    delete process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the form with username and password input and submit button", () => {
    render(<Page />);

    expect(screen.getByLabelText(/username|邮箱/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password|密码/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in|登录/i }),
    ).toBeInTheDocument();
  });

  it("calls login in successful form submission", async () => {
    (login as jest.Mock).mockResolvedValue({});

    render(<Page />);

    const usernameInput = screen.getByLabelText(/username|邮箱/i);
    const passwordInput = screen.getByLabelText(/password|密码/i);
    const submitButton = screen.getByRole("button", { name: /sign in|登录/i });

    fireEvent.change(usernameInput, {
      target: { value: "testuser@example.com" },
    });
    fireEvent.change(passwordInput, { target: { value: "#123176a@" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(login).toHaveBeenCalled();
      const calls = (login as jest.Mock).mock.calls;
      const [, formData] = calls[0] as [unknown, FormData];
      expect(formData.get("username")).toBe("testuser@example.com");
      expect(formData.get("password")).toBe("#123176a@");
      expect(formData.get("next")).toBe("");
    });
  });

  it("displays error message if login fails", async () => {
    // Mock a failed login
    (login as jest.Mock).mockResolvedValue({
      server_validation_error: "LOGIN_BAD_CREDENTIALS",
    });

    render(<Page />);

    const usernameInput = screen.getByLabelText(/username|邮箱/i);
    const passwordInput = screen.getByLabelText(/password|密码/i);
    const submitButton = screen.getByRole("button", { name: /sign in|登录/i });

    fireEvent.change(usernameInput, { target: { value: "wrong@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "wrongpass" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("LOGIN_BAD_CREDENTIALS")).toBeInTheDocument();
    });
  });

  it("displays server error for unexpected errors", async () => {
    (login as jest.Mock).mockResolvedValue({
      server_error: "An unexpected error occurred. Please try again later.",
    });

    render(<Page />);

    const usernameInput = screen.getByLabelText(/username|邮箱/i);
    const passwordInput = screen.getByLabelText(/password|密码/i);
    const submitButton = screen.getByRole("button", { name: /sign in|登录/i });

    fireEvent.change(usernameInput, { target: { value: "test@test.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(
          "An unexpected error occurred. Please try again later.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("prefills credentials when dev prefill is enabled", () => {
    process.env.NEXT_PUBLIC_DEV_LOGIN_PREFILL = "true";
    process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL = "admin@example.com";
    process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD = "admin123";

    render(<Page />);

    expect(screen.getByLabelText(/username|邮箱/i)).toHaveValue("admin@example.com");
    expect(screen.getByLabelText(/password|密码/i)).toHaveValue("admin123");
  });
});
