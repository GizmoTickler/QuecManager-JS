// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock environment variables
process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_only'
process.env.NODE_ENV = 'test'

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
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
}
