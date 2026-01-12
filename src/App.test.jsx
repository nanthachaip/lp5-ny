import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from './App'
import { supabase } from './supabaseClient'

// Helper to create a chainable mock builder
const createMockBuilder = (resultData = { data: [], error: null }) => {
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    then: (resolve, reject) => Promise.resolve(resultData).then(resolve, reject)
  }

  // Default chaining: methods return the same builder (preserving the resultData)
  // unless overridden in a test
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.single.mockReturnValue(builder)

  return builder
}

// Mock Supabase client
vi.mock('./supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: from() returns a builder that resolves to empty list
    supabase.from.mockReturnValue(createMockBuilder({ data: [], error: null }))
  })

  it('renders the join form initially', async () => {
    render(<App />)
    
    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    expect(screen.getByText("New Year's Gift Exchange 🎁")).toBeInTheDocument()
    expect(screen.getByText('Join the Lottery')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument()
  })

  it('shows error when submitting empty form', async () => {
    render(<App />)
    
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    const button = screen.getByText('Join / Login')
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getByText('Please fill in all fields')).toBeInTheDocument()
    })
  })

  it('allows a user to join successfully', async () => {
    const newUser = { id: 1, name: 'Alice', wishes: ['A', 'B', 'C'] }
    
    // Call 1: fetchParticipants (select *)
    const fetchBuilder = createMockBuilder({ data: [], error: null })
    
    // Call 2: checkLotteryStatus (select drawn_participant_id)
    const statusBuilder = createMockBuilder({ data: [], error: null })
    
    // Call 3: insert
    const insertResultBuilder = createMockBuilder({ data: [newUser], error: null })
    const insertBuilder = createMockBuilder()
    insertBuilder.insert.mockReturnValue(insertResultBuilder) 
    
    supabase.from
      .mockReturnValueOnce(fetchBuilder)
      .mockReturnValueOnce(statusBuilder)
      .mockReturnValueOnce(insertBuilder)

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByPlaceholderText('First wish'), { target: { value: 'A' } })
    fireEvent.change(screen.getByPlaceholderText('Second wish'), { target: { value: 'B' } })
    fireEvent.change(screen.getByPlaceholderText('Third wish'), { target: { value: 'C' } })

    fireEvent.click(screen.getByText('Join / Login'))

    await waitFor(() => {
      expect(screen.getByText('Welcome, Alice!')).toBeInTheDocument()
    })
  })

  it('logs in an existing user', async () => {
    const existingUser = { id: 1, name: 'Bob', wishes: ['X', 'Y', 'Z'] }
    
    // Call 1: fetchParticipants -> returns [existingUser]
    const fetchBuilder = createMockBuilder({ data: [existingUser], error: null })
    
    // Call 2: checkLotteryStatus
    const statusBuilder = createMockBuilder({ data: [], error: null })
    
    supabase.from
      .mockReturnValueOnce(fetchBuilder)
      .mockReturnValueOnce(statusBuilder)

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByPlaceholderText('First wish'), { target: { value: 'X' } })
    fireEvent.change(screen.getByPlaceholderText('Second wish'), { target: { value: 'Y' } })
    fireEvent.change(screen.getByPlaceholderText('Third wish'), { target: { value: 'Z' } })

    fireEvent.click(screen.getByText('Join / Login'))

    await waitFor(() => {
      expect(screen.getByText('Welcome, Bob!')).toBeInTheDocument()
    })
  })

  it('shows lottery status as open and allows drawing', async () => {
    const user1 = { id: 1, name: 'Alice', wishes: ['A', 'B', 'C'] }
    const user2 = { id: 2, name: 'Bob', wishes: ['X', 'Y', 'Z'] }
    
    // 1. fetchParticipants
    const fetchBuilder = createMockBuilder({ data: [user1, user2], error: null })
    
    // 2. checkLotteryStatus
    const statusBuilder = createMockBuilder({ data: [], error: null })
    
    // 3. Update calls (inside handleDraw loop)
    const updateBuilder = createMockBuilder({ data: [], error: null })
    
    // 4. Refresh current user (select single)
    const refreshUserBuilder = createMockBuilder({ data: { ...user1, drawn_participant_id: 2 }, error: null })
    
    supabase.from
      .mockReturnValueOnce(fetchBuilder)
      .mockReturnValueOnce(statusBuilder)
      .mockReturnValueOnce(updateBuilder) // update 1
      .mockReturnValueOnce(updateBuilder) // update 2
      .mockReturnValueOnce(refreshUserBuilder) // refresh user

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Login as Alice
    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByPlaceholderText('First wish'), { target: { value: 'A' } })
    fireEvent.change(screen.getByPlaceholderText('Second wish'), { target: { value: 'B' } })
    fireEvent.change(screen.getByPlaceholderText('Third wish'), { target: { value: 'C' } })
    fireEvent.click(screen.getByText('Join / Login'))

    await waitFor(() => {
      expect(screen.getByText('Start Lottery Draw')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Start Lottery Draw'))

    await waitFor(() => {
      expect(screen.getByText('The lottery has been drawn!')).toBeInTheDocument()
    })
  })

  it('reveals the drawn person', async () => {
    const user1 = { id: 1, name: 'Alice', drawn_participant_id: 2, wishes: ['A', 'B', 'C'] }
    const user2 = { id: 2, name: 'Bob', wishes: ['X', 'Y', 'Z'] }
    
    // 1. fetchParticipants
    const fetchBuilder = createMockBuilder({ data: [user1, user2], error: null })
    
    // 2. checkLotteryStatus -> returns data indicating draw happened
    const statusBuilder = createMockBuilder({ data: [{ drawn_participant_id: 2 }, { drawn_participant_id: 1 }], error: null })
    
    // 3. Reveal draw (select single)
    const revealBuilder = createMockBuilder({ data: user2, error: null })
    
    supabase.from
      .mockReturnValueOnce(fetchBuilder)
      .mockReturnValueOnce(statusBuilder)
      .mockReturnValueOnce(revealBuilder)

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Login as Alice
    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByPlaceholderText('First wish'), { target: { value: 'A' } })
    fireEvent.change(screen.getByPlaceholderText('Second wish'), { target: { value: 'B' } })
    fireEvent.change(screen.getByPlaceholderText('Third wish'), { target: { value: 'C' } })
    fireEvent.click(screen.getByText('Join / Login'))

    await waitFor(() => {
      expect(screen.getByText('See who you need to buy for')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('See who you need to buy for'))

    await waitFor(() => {
      expect(screen.getByText('X')).toBeInTheDocument()
      expect(screen.getByText('Y')).toBeInTheDocument()
      expect(screen.getByText('Z')).toBeInTheDocument()
    })
  })
})
