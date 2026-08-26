// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExamenAutocomplete, type ExamenAutocompleteItem } from "./ExamenAutocomplete";

const items: ExamenAutocompleteItem[] = [
  {
    id: "1",
    titulo_id: "t1",
    nombre: "Hemograma",
    precio_usd: 10.5,
    unidad: "unidad",
    activo: true,
  },
  {
    id: "2",
    titulo_id: "t1",
    nombre: "Hemocultivo",
    precio_usd: 25,
    unidad: null,
    activo: true,
  },
  {
    id: "3",
    titulo_id: "t2",
    nombre: "Glicemia",
    precio_usd: 5,
    unidad: "mg/dL",
    activo: true,
  },
];

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  };
}

function mockFetcher(data: ExamenAutocompleteItem[] = items): typeof fetch {
  return vi.fn(async () => jsonResponse(data)) as unknown as typeof fetch;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ExamenAutocomplete", () => {
  it("debounces search requests to 250ms", async () => {
    vi.useFakeTimers();
    const fetcher = mockFetcher();

    render(
      <ExamenAutocomplete onSelect={vi.fn()} fetcher={fetcher} minLength={1} />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "hemo" } });
    fireEvent.change(input, { target: { value: "hemog" } });

    expect(fetcher).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(249);
    });
    expect(fetcher).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/examenes?term=hemog",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("navigates options with arrow keys and selects with Enter", async () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();

    render(
      <ExamenAutocomplete
        onSelect={onSelect}
        fetcher={mockFetcher()}
        minLength={1}
        debounceMs={0}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "hemo" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getAllByRole("option")).toHaveLength(3);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(items[1]);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("wraps ArrowUp to the last option and closes with Escape", async () => {
    vi.useFakeTimers();

    render(
      <ExamenAutocomplete
        onSelect={vi.fn()}
        fetcher={mockFetcher()}
        minLength={1}
        debounceMs={0}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "hemo" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toContain("-option-2");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("keeps focus on the input after selecting when autoFocusOnSelect is enabled", async () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();

    render(
      <ExamenAutocomplete
        onSelect={onSelect}
        fetcher={mockFetcher()}
        minLength={1}
        debounceMs={0}
        autoFocusOnSelect
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "hemo" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]!.querySelector("button")!);

    expect(onSelect).toHaveBeenCalledWith(items[0]);
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
  });

  it("does not steal focus after selecting when autoFocusOnSelect is disabled", async () => {
    vi.useFakeTimers();

    render(
      <ExamenAutocomplete
        onSelect={vi.fn()}
        fetcher={mockFetcher()}
        minLength={1}
        debounceMs={0}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "hemo" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]!.querySelector("button")!);

    expect(document.activeElement).not.toBe(screen.getByRole("combobox"));
  });

  it("shows 'Ya agregado' badge and prevents duplicate selection", async () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();

    render(
      <ExamenAutocomplete
        onSelect={onSelect}
        fetcher={mockFetcher()}
        minLength={1}
        debounceMs={0}
        selectedIds={["1"]}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "hemo" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByText("Ya agregado")).toBeTruthy();

    const disabledButton = screen.getByText("Hemograma").closest("button");
    fireEvent.click(disabledButton!);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });
});
