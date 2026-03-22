import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { CreditsProvider, useCredits } from "@/components/credits/CreditsContext";

jest.mock("@/components/actions/credits-actions", () => ({
  creditsMy: jest.fn(),
}));

const { creditsMy } = jest.requireMock("@/components/actions/credits-actions") as {
  creditsMy: jest.Mock;
};

function Probe() {
  const { balance, isLoading, refresh } = useCredits();
  return (
    <div>
      <div data-testid="balance">{balance}</div>
      <div data-testid="loading">{String(isLoading)}</div>
      <button type="button" onClick={() => void refresh()}>
        refresh
      </button>
    </div>
  );
}

describe("CreditsContext", () => {
  beforeEach(() => {
    creditsMy.mockReset();
  });

  it("refreshes global balance from creditsMy", async () => {
    creditsMy.mockResolvedValue({ data: { balance: 321 } });

    render(
      <CreditsProvider initialBalance={100}>
        <Probe />
      </CreditsProvider>,
    );

    expect(screen.getByTestId("balance")).toHaveTextContent("100");

    await act(async () => {
      screen.getByRole("button", { name: "refresh" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("balance")).toHaveTextContent("321");
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("keeps existing balance when refresh fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    creditsMy.mockRejectedValue(new Error("boom"));

    render(
      <CreditsProvider initialBalance={100}>
        <Probe />
      </CreditsProvider>,
    );

    await act(async () => {
      screen.getByRole("button", { name: "refresh" }).click();
    });

    await waitFor(() => {
      expect(creditsMy).toHaveBeenCalled();
    });
    expect(screen.getByTestId("balance")).toHaveTextContent("100");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");

    errorSpy.mockRestore();
  });
});
