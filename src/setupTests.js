import "@testing-library/jest-dom";

// Mock the NDK module globally to avoid actual relay connections in tests
vi.mock("./ndk", () => ({
  getNDK: vi.fn(() => ({
    getUser: vi.fn(() => ({
      fetchProfile: vi.fn().mockResolvedValue(undefined),
      profile: {},
    })),
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => ({
      on: vi.fn(),
      stop: vi.fn(),
    })),
    fetchEvents: vi.fn().mockResolvedValue(new Map()),
  })),
  connectNDK: vi.fn().mockResolvedValue(undefined),
  disconnectNDK: vi.fn(),
}));

// Mock localStorage for testing
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Mock matchMedia for responsive tests
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollTo
window.scrollTo = vi.fn();