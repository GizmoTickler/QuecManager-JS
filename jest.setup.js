// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

// Mock environment variables
process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_only'
process.env.NODE_ENV = 'test'

// Add TextEncoder/TextDecoder for jose library
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock Request and Response for Next.js server
if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = class Request {
    constructor(input, init) {
      this.url = input
      this.method = init?.method || 'GET'
      this.headers = new Map(Object.entries(init?.headers || {}))
    }
  }
}

if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class Response {
    constructor(body, init) {
      this.body = body
      this.status = init?.status || 200
      this.headers = new Map(Object.entries(init?.headers || {}))
      // Store the parsed JSON if body is a string
      try {
        this._json = typeof body === 'string' ? JSON.parse(body) : body
      } catch {
        this._json = body
      }
    }

    static json(data, init) {
      const response = new Response(JSON.stringify(data), init)
      // Override with the actual data object
      response._json = data
      return response
    }

    async json() {
      return this._json
    }
  }
}

// Mock Headers
if (typeof globalThis.Headers === 'undefined') {
  globalThis.Headers = Map
}

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return ''
  },
}))

// Suppress console errors in tests (optional)
const originalConsole = { ...console }
global.console = {
  ...console,
  error: jest.fn((...args) => {
    // Only log if not a test-related error
    if (!args[0]?.toString().includes('Token verification failed')) {
      originalConsole.error(...args)
    }
  }),
  warn: jest.fn(),
}
