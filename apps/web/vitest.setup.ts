import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest no registra el afterEach global de Testing Library sin `globals: true`.
afterEach(() => {
  cleanup();
});
