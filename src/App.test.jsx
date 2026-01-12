import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from './App'
import { supabase } from './supabaseClient'

// Mock Supabase client
vi.mock('./supabaseClient', () => {
  const selectMock = vi.fn()
  const insertMock = vi.fn()
  const updateMock = vi.fn()
  const eqMock = vi.fn()
  const singleMock = vi.fn()

  const fromMock = vi.fn(() => ({
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    eq: eqMock,
    single: singleMock,
  }))

  // Chainable mocks
  selectMock.mockReturnValue({ data: [], error: null })
  insertMock.mockReturnValue({ select: vi.fn(() => ({ data: [], error: null })) })
  updateMock.mockReturnValue({ eq: eqMock })
  eqMock.mockReturnValue({ single: singleMock, data: [], error: null })
  singleMock.mockReturnValue({ data: null, error: null })

  return {
    supabase: {
      from: fromMock,
    },
  }
})

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default mock implementation for fetching participants
    const selectMock = supabase.from().select
    selectMock.mockResolvedValue({ data: [], error: null })
  })

  it('renders the join form initially', async () => {
    render(<App />)
    expect(screen.getByText("New Year's Gift Exchange 🎁")).toBeInTheDocument()
    expect(screen.getByText('Join the Lottery')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument()
  })

  it('shows error when submitting empty form', async () => {
    render(<App />)
    const button = screen.getByText('Join / Login')
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getByText('Please fill in all fields')).toBeInTheDocument()
    })
  })

  it('allows a user to join successfully', async () => {
    // Mock successful insert
    const newUser = { id: 1, name: 'Alice', wishes: { item1: 'A', item2: 'B', item3: 'C' } }
    
    const selectMock = supabase.from().select
    // First call for fetchParticipants, second for checkLotteryStatus
    selectMock.mockResolvedValueOnce({ data: [], error: null })
              .mockResolvedValueOnce({ data: [], error: null })

    const insertMock = supabase.from().insert
    insertMock.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [newUser], error: null })
    })

    render(<App />)

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
    const existingUser = { id: 1, name: 'Bob', wishes: { item1: 'X', item2: 'Y', item3: 'Z' } }
    
    const selectMock = supabase.from().select
    selectMock.mockResolvedValueOnce({ data: [existingUser], error: null }) // fetchParticipants
              .mockResolvedValueOnce({ data: [], error: null }) // checkLotteryStatus

    render(<App />)

    // Wait for initial fetch
    await waitFor(() => {
      // We don't see the list immediately because we are not logged in, but the state is updated
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
    const user1 = { id: 1, name: 'Alice', wishes: { item1: 'A', item2: 'B', item3: 'C' } }
    const user2 = { id: 2, name: 'Bob', wishes: { item1: 'X', item2: 'Y', item3: 'Z' } }
    
    const selectMock = supabase.from().select
    selectMock.mockResolvedValueOnce({ data: [user1, user2], error: null }) // fetchParticipants
              .mockResolvedValueOnce({ data: [], error: null }) // checkLotteryStatus

    // Mock update for draw
    const updateMock = supabase.from().update
    updateMock.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    })

    // Mock refreshing current user
    const singleMock = supabase.from().select().eq().single
    singleMock.mockResolvedValue({ data: { ...user1, drawn_participant_id: 2 }, error: null })

    render(<App />)

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
    const user1 = { id: 1, name: 'Alice', drawn_participant_id: 2, wishes: { item1: 'A', item2: 'B', item3: 'C' } }
    const user2 = { id: 2, name: 'Bob', wishes: { item1: 'X', item2: 'Y', item3: 'Z' } }
    
    const selectMock = supabase.from().select
    selectMock.mockResolvedValueOnce({ data: [user1, user2], error: null }) // fetchParticipants
              .mockResolvedValueOnce({ data: [{ drawn_participant_id: 2 }, { drawn_participant_id: 1 }], error: null }) // checkLotteryStatus

    // Mock reveal fetch
    const singleMock = supabase.from().select().eq().single
    singleMock.mockResolvedValue({ data: user2, error: null })

    render(<App />)

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
