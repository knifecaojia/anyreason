import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { LoginForm } from "@/app/login/LoginForm";
import { login } from "@/components/actions/login-action";

jest.mock("../components/actions/login-action", () => ({
  login: jest.fn(),
}));

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: jest.fn().mockReturnValue(""),
  }),
}));

describe("Login Form Component", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the form with username and password input and submit button", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText(/username|邮箱/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password|密码/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in|登录/i }),
    ).toBeInTheDocument();
  });

  it("calls login in successful form submission", async () => {
    (login as jest.Mock).mockResolvedValue({});

    render(<LoginForm />);

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
    });
  });

  it("displays error message if login fails", async () => {
    // Mock a failed login
    (login as jest.Mock).mockResolvedValue({
      server_validation_error: "LOGIN_BAD_CREDENTIALS",
    });

    render(<LoginForm />);

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

  it("prefills credentials when initialUsername is provided (Remember Me)", () => {
    render(<LoginForm initialUsername="remembered@example.com" />);

    expect(screen.getByLabelText(/username|邮箱/i)).toHaveValue("remembered@example.com");
    expect(screen.getByLabelText(/remember me|记住我/i)).toBeChecked();
  });

  it("prefills credentials when dev prefill props are passed", () => {
    render(
      <LoginForm 
        prefillEmail="admin@example.com" 
        prefillPassword="admin123" 
      />
    );

    expect(screen.getByLabelText(/username|邮箱/i)).toHaveValue("admin@example.com");
    expect(screen.getByLabelText(/password|密码/i)).toHaveValue("admin123");
  });
});
