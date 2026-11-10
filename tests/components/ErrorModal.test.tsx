import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorModal } from "@/components/ui/ErrorModal";

describe("ErrorModal", () => {
  it("shows friendly quota copy and retries", async () => {
    const retry = vi.fn();
    render(<ErrorModal error={{ error: "llm_unavailable", kind: "daily_limit" }} onClose={() => {}} onRetry={retry} />);
    expect(screen.getByText(/try again tomorrow/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
