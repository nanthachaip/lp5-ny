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
    neq: vi.fn(),
    then: (resolve, reject) => Promise.resolve(resultData).then(resolve, reject)
  }

  // Default chaining: methods return the same builder (preserving the resultData)
  // unless overridden in a test
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.single.mockReturnValue(builder)
  builder.neq.mockReturnValue(builder)

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

  it('renders the login form initially', async () => {
    render(<App />)
    
    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    expect(screen.getByText("LP5 New Year's Party")).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter user')).toBeInTheDocument()
  })

  it('shows error when submitting empty form', async () => {
    render(<App />)
    
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Switch to Join mode
    const joinLink = screen.getByText('Join now')
    fireEvent.click(joinLink)

    const button = screen.getByRole('button', { name: 'Join' })
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getByText('Please fill in all fields')).toBeInTheDocument()
    })
  })

  it('allows a user to join successfully', async () => {
    const newUser = { id: 'alice', name: 'Alice', wishes: ['', '', ''] }
    
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

    // Switch to Join mode
    fireEvent.click(screen.getByText('Join now'))

    fireEvent.change(screen.getByPlaceholderText('Enter user'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'password' } })

    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => {
      expect(screen.getByText('Welcome, Alice!')).toBeInTheDocument()
    })
  })

  it('logs in an existing user', async () => {
    const existingUser = { id: 'bob', name: 'Bob', password: 'password', wishes: ['X', 'Y', 'Z'] }
    
    // Call 1: fetchParticipants -> returns [existingUser]
    const fetchBuilder = createMockBuilder({ data: [existingUser], error: null })
    
    // Call 2: checkLotteryStatus
    const statusBuilder = createMockBuilder({ data: [], error: null })
    
    // Call 3: Login select single
    const loginBuilder = createMockBuilder({ data: existingUser, error: null })

    supabase.from
      .mockReturnValueOnce(fetchBuilder)
      .mockReturnValueOnce(statusBuilder)
      .mockReturnValueOnce(loginBuilder)

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Enter user'), { target: { value: 'bob' } })
    fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'password' } })

    fireEvent.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => {
      expect(screen.getByText('Welcome, Bob!')).toBeInTheDocument()
    })
  })

  it('shows lottery status as open and allows drawing (admin)', async () => {
    const adminUser = { id: 'admin', name: 'Admin', password: 'password', wishes: [] }
    const user1 = { id: 'alice', name: 'Alice', wishes: ['A', 'B', 'C'] }
    const user2 = { id: 'bob', name: 'Bob', wishes: ['X', 'Y', 'Z'] }
    
    // 1. fetchParticipants
    const fetchBuilder = createMockBuilder({ data: [adminUser, user1, user2], error: null })
    
    // 2. checkLotteryStatus
    const statusBuilder = createMockBuilder({ data: [], error: null })
    
    // 3. Login
    const loginBuilder = createMockBuilder({ data: adminUser, error: null })

    // 4. Update calls (inside handleDraw loop)
    const updateBuilder = createMockBuilder({ data: [], error: null })
    
    // 5. Refresh current user (select single)
    const refreshUserBuilder = createMockBuilder({ data: { ...adminUser }, error: null })
    
    supabase.from
      .mockReturnValueOnce(fetchBuilder)
      .mockReturnValueOnce(statusBuilder)
      .mockReturnValueOnce(loginBuilder)
      .mockReturnValueOnce(updateBuilder) // update 1
      .mockReturnValueOnce(updateBuilder) // update 2
      .mockReturnValueOnce(refreshUserBuilder) // refresh user

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Login as Admin
    fireEvent.change(screen.getByPlaceholderText('Enter user'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => {
      expect(screen.getByText('Start Lottery Draw')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Start Lottery Draw'))

    await waitFor(() => {
      expect(screen.getByText('The lottery has been drawn!')).toBeInTheDocument()
    })
  })

  it('reveals the drawn person', async () => {
    const user1 = { id: 'alice', name: 'Alice', password: 'password', drawn_participant_id: 'bob', wishes: ['A', 'B', 'C'] }
    const user2 = { id: 'bob', name: 'Bob', wishes: ['X', 'Y', 'Z'] }
    
    // 1. fetchParticipants
    const fetchBuilder = createMockBuilder({ data: [user1, user2], error: null })
    
    // 2. checkLotteryStatus -> returns data indicating draw happened
    const statusBuilder = createMockBuilder({ data: [{ drawn_participant_id: 'bob' }, { drawn_participant_id: 'alice' }], error: null })
    
    // 3. Login
    const loginBuilder = createMockBuilder({ data: user1, error: null })

    // 4. Reveal draw (select single)
    const revealBuilder = createMockBuilder({ data: user2, error: null })
    
    supabase.from
      .mockReturnValueOnce(fetchBuilder)
      .mockReturnValueOnce(statusBuilder)
      .mockReturnValueOnce(loginBuilder)
      .mockReturnValueOnce(revealBuilder)

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Login as Alice
    fireEvent.change(screen.getByPlaceholderText('Enter user'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))

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

  it('allows user to update wishes', async () => {
    const user = { id: 'alice', name: 'Alice', password: 'password', wishes: ['A', 'B', 'C'] }
    
    // 1. fetchParticipants
    const fetchBuilder = createMockBuilder({ data: [user], error: null })
    
    // 2. checkLotteryStatus
    const statusBuilder = createMockBuilder({ data: [], error: null })
    
    // 3. Login
    const loginBuilder = createMockBuilder({ data: user, error: null })

    // 4. Update wishes
    const updatedUser = { ...user, wishes: ['New A', 'New B', 'New C'] }
    const updateBuilder = createMockBuilder({ data: updatedUser, error: null })

    supabase.from
      .mockReturnValueOnce(fetchBuilder)
      .mockReturnValueOnce(statusBuilder)
      .mockReturnValueOnce(loginBuilder)
      .mockReturnValueOnce(updateBuilder)

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Login
    fireEvent.change(screen.getByPlaceholderText('Enter user'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => {
      expect(screen.getByText('Welcome, Alice!')).toBeInTheDocument()
    })

    // Click Edit Wishes
    fireEvent.click(screen.getByText('Edit Wishes'))

    // Change wishes
    const inputs = screen.getAllByPlaceholderText(/wish/i)
    fireEvent.change(inputs[0], { target: { value: 'New A' } })
    fireEvent.change(inputs[1], { target: { value: 'New B' } })
    fireEvent.change(inputs[2], { target: { value: 'New C' } })

    fireEvent.click(screen.getByText('Save Wishes'))

    await waitFor(() => {
      expect(screen.getByText('New A')).toBeInTheDocument()
      expect(screen.getByText('New B')).toBeInTheDocument()
      expect(screen.getByText('New C')).toBeInTheDocument()
    })
  })

  it('allows admin to reveal all names globally', async () => {
    const adminUser = { id: 'admin', name: 'Admin', password: 'password', wishes: [] }
    
    // 1. fetchParticipants
    const fetchBuilder = createMockBuilder({ data: [adminUser], error: null })
    
    // 2. checkLotteryStatus (drawn but not revealed)
    const statusBuilder = createMockBuilder({ data: [{ drawn_participant_id: 'x', is_revealed: false }], error: null })
    
    // 3. Login
    const loginBuilder = createMockBuilder({ data: adminUser, error: null })

    // 4. Global reveal update
    const updateBuilder = createMockBuilder({ data: [], error: null })

    supabase.from
      .mockReturnValueOnce(fetchBuilder)
      .mockReturnValueOnce(statusBuilder)
      .mockReturnValueOnce(loginBuilder)
      .mockReturnValueOnce(updateBuilder)

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Login
    fireEvent.change(screen.getByPlaceholderText('Enter user'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => {
      expect(screen.getByText('Reveal All Names to Participants')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Reveal All Names to Participants'))

    // Since we don't re-fetch status in the component immediately (it sets local state), 
    // we check if the button disappears or state changes.
    // In the code: setIsNamesRevealed(true) which hides the button.
    await waitFor(() => {
      expect(screen.queryByText('Reveal All Names to Participants')).not.toBeInTheDocument()
    })
  })
})
