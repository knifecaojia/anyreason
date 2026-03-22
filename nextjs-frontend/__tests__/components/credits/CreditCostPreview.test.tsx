import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { CreditCostPreview } from "@/components/credits/CreditCostPreview";

describe("CreditCostPreview", () => {
  let originalFetch: typeof global.fetch | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      // @ts-expect-error cleanup for test env without fetch
      delete global.fetch;
    }
  });

  it("renders explicit insufficient-balance warning state", () => {
    render(<CreditCostPreview category="video" estimatedCost={50} userBalance={1} size="sm" />);

    expect(screen.getByText("消耗 50 积分")).toBeInTheDocument();
    expect(screen.getByText("(余额: 1)")).toBeInTheDocument();
    expect(screen.getByText("余额不足，请先充值后再执行")).toBeInTheDocument();
  });

  it("renders fallback estimate message when cost API fails", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;

    render(<CreditCostPreview category="image" userBalance={99} size="sm" />);

    await waitFor(() => {
      expect(screen.getByText("消耗 5 积分")).toBeInTheDocument();
    });
    expect(screen.getByText("预估暂不可用，已显示默认价格")).toBeInTheDocument();
    expect(screen.getByText("(余额: 99)")).toBeInTheDocument();
  });

  it("renders loading state while estimating", () => {
    render(<CreditCostPreview category="text" loading estimatedCost={1} userBalance={10} size="sm" />);

    expect(screen.getByText("计算中...")).toBeInTheDocument();
    expect(screen.queryByText(/余额不足/)).not.toBeInTheDocument();
  });

  it("uses provided estimated cost without fetching and shows normal state", () => {
    global.fetch = jest.fn().mockImplementation(() => {
      throw new Error("fetch should not be called");
    }) as unknown as typeof fetch;

    render(<CreditCostPreview category="text" estimatedCost={3} userBalance={20} size="sm" />);

    expect(screen.getByText("消耗 3 积分")).toBeInTheDocument();
    expect(screen.getByText("(余额: 20)")).toBeInTheDocument();
    expect(screen.queryByText("预估暂不可用，已显示默认价格")).not.toBeInTheDocument();
    expect(screen.queryByText("余额不足，请先充值后再执行")).not.toBeInTheDocument();
  });
});
