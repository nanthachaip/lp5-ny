import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [username, setUsername] = useState('') // Maps to 'id'
  const [name, setName] = useState('')         // Maps to 'name' (Display Name)
  const [password, setPassword] = useState('')
  
  // Wish state for editing
  const [wish1, setWish1] = useState('')
  const [wish2, setWish2] = useState('')
  const [wish3, setWish3] = useState('')
  
  const [participants, setParticipants] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [drawResult, setDrawResult] = useState(null)
  
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lotteryStatus, setLotteryStatus] = useState('open') // open, drawn, revealed
  const [isNamesRevealed, setIsNamesRevealed] = useState(false)
  const [isLoginMode, setIsLoginMode] = useState(true)
  const [isEditingWishes, setIsEditingWishes] = useState(false)

  const ADMIN_USERNAME = 'admin'

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchParticipants(), checkLotteryStatus()])
      setInitialLoading(false)
    }
    init()
  }, [])

  // When currentUser changes, update local wish state
  useEffect(() => {
    if (currentUser && currentUser.wishes) {
      setWish1(currentUser.wishes[0] || '')
      setWish2(currentUser.wishes[1] || '')
      setWish3(currentUser.wishes[2] || '')
    } else {
      setWish1('')
      setWish2('')
      setWish3('')
    }
  }, [currentUser])

  const fetchParticipants = async () => {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
    if (error) console.error('Error fetching participants:', error)
    else setParticipants(data || [])
  }

  const checkLotteryStatus = async () => {
    const { data } = await supabase.from('participants').select('drawn_participant_id, is_revealed')
    
    if (data && data.length > 0) {
      // Check if drawn
      const hasDraws = data.some(p => p.drawn_participant_id !== null)
      if (hasDraws) {
        setLotteryStatus('drawn')
      }
      
      // Check if revealed (assuming global reveal, so checking any row is fine, or check if all are true)
      // We'll check if at least one is revealed (assuming admin reveals all at once)
      const revealed = data.some(p => p.is_revealed === true)
      setIsNamesRevealed(revealed)
    }
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (isLoginMode) {
      // LOGIN LOGIC
      if (!username || !password) {
        setError("Please enter username and password")
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .eq('id', username)
        .single()

      if (error || !data) {
        setError("User not found")
      } else {
        if (data.password && data.password !== password) {
           setError("Invalid password")
        } else {
           setCurrentUser(data)
        }
      }
    } else {
      // REGISTER LOGIC
      if (!username || !name || !password) {
        setError("Please fill in all fields")
        setLoading(false)
        return
      }

      const existing = participants.find(p => p.id?.toLowerCase() === username.toLowerCase())
      if (existing) {
        setError("Username already taken")
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('participants')
        .insert([
          { 
            id: username,
            name: name,
            password: password,
            wishes: ['', '', ''] // Initialize with empty wishes
          }
        ])
        .select()

      if (error) {
        setError(error.message)
      } else {
        setParticipants([...participants, data[0]])
        setCurrentUser(data[0])
        // Automatically go to edit wishes mode after registration
        setIsEditingWishes(true)
      }
    }
    setLoading(false)
  }

  const handleUpdateWishes = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const newWishes = [wish1, wish2, wish3]

    const { data, error } = await supabase
      .from('participants')
      .update({ wishes: newWishes })
      .eq('id', currentUser.id)
      .select()
      .single()

    if (error) {
      setError("Error updating wishes: " + error.message)
    } else {
      setCurrentUser(data)
      setIsEditingWishes(false)
      // Update participants list locally to reflect changes
      setParticipants(participants.map(p => p.id === data.id ? data : p))
    }
    setLoading(false)
  }

  const handleDraw = async () => {
    if (currentUser.id !== ADMIN_USERNAME) {
      setError("Only admin can start the draw")
      return
    }

    // Filter out admin from the draw
    const eligibleParticipants = participants.filter(p => p.id !== ADMIN_USERNAME)

    if (eligibleParticipants.length < 2) {
      setError("Need at least 2 eligible participants (excluding admin) to draw")
      return
    }
    
    setLoading(true)
    
    let shuffled = [...eligibleParticipants]
    let valid = false
    let attempts = 0
    
    while (!valid && attempts < 100) {
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      
      valid = true
      for (let i = 0; i < eligibleParticipants.length; i++) {
        if (eligibleParticipants[i].id === shuffled[i].id) {
          valid = false
          break
        }
      }
      attempts++
    }

    if (!valid) {
      setError("Could not generate a valid draw. Please try again.")
      setLoading(false)
      return
    }

    for (let i = 0; i < eligibleParticipants.length; i++) {
      const { error } = await supabase
        .from('participants')
        .update({ 
          drawn_participant_id: shuffled[i].id,
          is_revealed: false // Reset reveal status on new draw
        })
        .eq('id', eligibleParticipants[i].id)
      
      if (error) {
        console.error("Error updating draw", error)
        setError("Error saving draw results")
        setLoading(false)
        return
      }
    }

    setLotteryStatus('drawn')
    setIsNamesRevealed(false)
    setLoading(false)
    if (currentUser) {
      const { data } = await supabase.from('participants').select('*').eq('id', currentUser.id).single()
      setCurrentUser(data)
    }
  }

  const handleGlobalReveal = async () => {
    if (currentUser.id !== ADMIN_USERNAME) return
    setLoading(true)
    
    // Update all participants to revealed = true
    const { error } = await supabase
      .from('participants')
      .update({ is_revealed: true })
      .neq('id', ADMIN_USERNAME) // Update everyone except maybe admin (doesn't matter)

    if (error) {
      setError("Error revealing names: " + error.message)
    } else {
      setIsNamesRevealed(true)
    }
    setLoading(false)
  }

  const revealDraw = async () => {
    if (!currentUser || !currentUser.drawn_participant_id) return

    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('id', currentUser.drawn_participant_id)
      .single()
    
    if (error) {
      console.error("Error fetching drawn person", error)
    } else {
      setDrawResult(data)
    }
  }

  if (initialLoading) {
    return <div className="container">Loading...</div>
  }

  return (
    <div className="container">
      <h1>LP5 New Year's Party</h1>
      <h2>ความสนุกกำลังจะเกิดขึ้น</h2>
      
      {!currentUser ? (
        <div className="card">
          <h2>{isLoginMode ? 'Login' : 'Join the Lottery'}</h2>
          
          <form onSubmit={handleAuth}>
            <div className="form-group">
              <label>User</label>
              <input 
                type="text" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                placeholder="Enter user"
              />
            </div>

            {!isLoginMode && (
              <div className="form-group">
                <label>Display Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="Enter your name"
                />
              </div>
            )}
            
            <div className="form-group">
              <label>Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="Enter password"
              />
            </div>

            <button type="submit" disabled={loading}>
              {loading ? 'Processing...' : (isLoginMode ? 'Login' : 'Join')}
            </button>
            
            {error && <p className="error">{error}</p>}
            
            <p style={{marginTop: '1rem', fontSize: '0.9em'}}>
              {isLoginMode ? "Don't have an account? " : "Already joined? "}
              <a href="#" onClick={(e) => {
                e.preventDefault()
                setIsLoginMode(!isLoginMode)
                setError(null)
              }}>
                {isLoginMode ? "Join now" : "Login here"}
              </a>
            </p>
          </form>
        </div>
      ) : (
        <div className="card">
          <h2>Welcome, {currentUser.name}!</h2>
          
          {/* Wish Management Section */}
          <div className="wish-section" style={{marginBottom: '2rem', borderBottom: '1px solid #eee', paddingBottom: '1rem'}}>
            <h3>My Wish List</h3>
            {isEditingWishes ? (
              <form onSubmit={handleUpdateWishes}>
                <div className="form-group">
                  <label>Wish 1</label>
                  <input 
                    type="text" 
                    value={wish1} 
                    onChange={e => setWish1(e.target.value)} 
                    placeholder="First wish"
                  />
                </div>
                <div className="form-group">
                  <label>Wish 2</label>
                  <input 
                    type="text" 
                    value={wish2} 
                    onChange={e => setWish2(e.target.value)} 
                    placeholder="Second wish"
                  />
                </div>
                <div className="form-group">
                  <label>Wish 3</label>
                  <input 
                    type="text" 
                    value={wish3} 
                    onChange={e => setWish3(e.target.value)} 
                    placeholder="Third wish"
                  />
                </div>
                <div style={{display: 'flex', gap: '1rem'}}>
                  <button type="submit" disabled={loading}>Save Wishes</button>
                  <button type="button" onClick={() => setIsEditingWishes(false)} style={{backgroundColor: '#999'}}>Cancel</button>
                </div>
              </form>
            ) : (
              <div>
                <ul className="wish-list">
                  {currentUser.wishes && currentUser.wishes.map((w, i) => (
                    <li key={i}>{w || <em>(Empty)</em>}</li>
                  ))}
                </ul>
                <button onClick={() => setIsEditingWishes(true)} style={{marginTop: '1rem'}}>Edit Wishes</button>
              </div>
            )}
          </div>

          {lotteryStatus === 'open' && (
            <div>
              <p>Waiting for everyone to join...</p>
              <p>Current participants: {participants.length}</p>
              <ul>
                {participants.map(p => <li key={p.id}>{p.name}</li>)}
              </ul>
              
              {currentUser.id === ADMIN_USERNAME && (
                <button onClick={handleDraw} disabled={loading} style={{backgroundColor: '#d35400'}}>
                  {loading ? 'Drawing...' : 'Start Lottery Draw'}
                </button>
              )}
              
              {currentUser.id !== ADMIN_USERNAME && (
                <p style={{fontStyle: 'italic', color: '#666'}}>Waiting for admin to start the draw...</p>
              )}
            </div>
          )}

          {lotteryStatus === 'drawn' && (
            <div>
              <h3>The lottery has been drawn!</h3>
              
              {currentUser.id === ADMIN_USERNAME && !isNamesRevealed && (
                <div style={{marginBottom: '1rem', padding: '1rem', backgroundColor: '#fff3e0', borderRadius: '8px'}}>
                  <p><strong>Admin Control:</strong> Names are currently hidden.</p>
                  <button onClick={handleGlobalReveal} disabled={loading} style={{backgroundColor: '#e67e22'}}>
                    Reveal All Names to Participants
                  </button>
                </div>
              )}

              {!drawResult ? (
                <button onClick={revealDraw}>
                  See who you need to buy for
                </button>
              ) : (
                <div className="result-card">
                  <p>You need to buy a gift for someone who wants:</p>
                  <ul className="wish-list">
                    {drawResult.wishes.map((wish, index) => (
                      <li key={index}>{wish}</li>
                    ))}
                  </ul>
                  
                  {isNamesRevealed ? (
                    <div className="revealed-section">
                      <p className="note">The name is revealed!</p>
                      <p className="revealed-name">It's <strong>{drawResult.name}</strong>!</p>
                    </div>
                  ) : (
                    <div className="hidden-section" style={{marginTop: '1rem', padding: '1rem', backgroundColor: '#eee', borderRadius: '8px'}}>
                      <p><strong>Name is hidden!</strong></p>
                      <p>Wait for the admin to reveal the names on the lottery day.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          <button 
            onClick={() => setCurrentUser(null)} 
            style={{backgroundColor: '#666', marginTop: '2rem'}}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}

export default App
