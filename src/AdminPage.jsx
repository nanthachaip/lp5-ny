import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

function AdminPage({ onBack }) {
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  
  // State to track progress:
  // -1: Nothing shown
  // 0: Show 1st row giver
  // 0.5: Show 1st row receiver
  // 1: Show 2nd row giver
  // 1.5: Show 2nd row receiver
  // etc.
  const [step, setStep] = useState(-1)

  useEffect(() => {
    fetchParticipants()
  }, [])

  const fetchParticipants = async () => {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
    
    if (error) {
      console.error('Error fetching participants:', error)
    } else {
      setParticipants(data || [])
    }
    setLoading(false)
  }

  const getOrderedChain = () => {
    if (participants.length === 0) return []
    
    // Create a map for quick lookup
    const participantMap = new Map(participants.map(p => [p.id, p]))
    
    // Filter out admin and those who haven't drawn anyone (if any)
    const validParticipants = participants.filter(p => p.id !== 'admin' && p.drawn_participant_id)
    
    if (validParticipants.length === 0) return []

    // Build the chain in order: A -> B -> C -> A
    // Start with the first participant in the list (or random)
    let current = validParticipants[0]
    const orderedChain = []
    const visited = new Set()

    // We might have multiple disjoint cycles if the draw logic allows it (though standard Secret Santa is usually one big cycle)
    // But let's handle at least one main cycle or just follow the path.
    
    // Since we want to show A->B, then B->C, we need to find the person who is the receiver of the previous row
    // to be the giver of the next row.
    
    // Let's try to follow the chain from the first person.
    // Note: If there are multiple cycles, this will only show one cycle. 
    // If the draw logic guarantees one big loop, this is perfect.
    // If not, we might need to handle remaining unvisited participants.
    
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      
      const receiverId = current.drawn_participant_id
      const receiver = participantMap.get(receiverId)
      
      if (receiver) {
        orderedChain.push({
          giver: current.name,
          receiver: receiver.name,
          receiverId: receiver.id // Keep ID to find next giver
        })
        
        // The receiver becomes the next giver
        current = receiver
      } else {
        break // Should not happen if data is consistent
      }
    }
    
    // If there are left over participants (disjoint cycles), we should add them too.
    // Let's check for unvisited valid participants
    const unvisited = validParticipants.filter(p => !visited.has(p.id))
    
    // If we have unvisited nodes, it means there are multiple loops. 
    // We can just append them by starting a new chain from the first unvisited one.
    let remaining = unvisited
    while (remaining.length > 0) {
       let nextStart = remaining[0]
       while (nextStart && !visited.has(nextStart.id)) {
          visited.add(nextStart.id)
          const receiverId = nextStart.drawn_participant_id
          const receiver = participantMap.get(receiverId)
          
          if (receiver) {
            orderedChain.push({
              giver: nextStart.name,
              receiver: receiver.name,
              receiverId: receiver.id
            })
            nextStart = receiver
          } else {
            break
          }
       }
       remaining = validParticipants.filter(p => !visited.has(p.id))
    }

    return orderedChain
  }

  const handleNextStep = () => {
    setStep(prev => prev + 0.5)
  }

  if (loading) return <div>Loading...</div>

  const chain = getOrderedChain()

  return (
    <div className="card">
      <h2>Gift Exchange Chain</h2>
      <button onClick={onBack} style={{marginBottom: '1rem', backgroundColor: '#666'}}>Back to Main</button>
      
      {chain.length === 0 ? (
        <p>No draw results available yet.</p>
      ) : (
        <div style={{textAlign: 'left'}}>
          <div style={{marginBottom: '1rem', textAlign: 'center'}}>
            <button 
              onClick={handleNextStep} 
              disabled={step >= chain.length - 0.5}
              style={{
                backgroundColor: '#F37021', 
                fontSize: '1.1em', 
                padding: '0.8rem 1.5rem',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
              }}
            >
              {step === -1 ? "Start Reveal" : 
               step % 1 === 0 ? "Reveal Receiver" : "Next Giver"}
            </button>
          </div>

          <ul style={{listStyle: 'none', padding: 0}}>
            {chain.map((link, index) => {
              // Logic to determine visibility
              // Row is visible if step >= index
              // Receiver is visible if step >= index + 0.5
              
              if (step < index) return null // Don't render future rows

              const isReceiverRevealed = step >= index + 0.5

              return (
                <li 
                  key={index} 
                  style={{
                    padding: '1rem', 
                    borderBottom: '1px solid #eee', 
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: isReceiverRevealed ? '#fff8f3' : '#fff',
                    transition: 'background-color 0.3s ease'
                  }}
                >
                  <span style={{fontWeight: 'bold', fontSize: '1.1em', color: '#333'}}>{link.giver}</span> 
                  <span style={{margin: '0 1rem', color: '#F37021'}}>➔</span>
                  <span style={{
                    fontWeight: isReceiverRevealed ? 'bold' : 'normal',
                    color: isReceiverRevealed ? '#F37021' : '#ccc',
                    backgroundColor: isReceiverRevealed ? 'transparent' : '#f5f5f5',
                    padding: '0.4rem 1rem',
                    borderRadius: '20px',
                    minWidth: '100px',
                    textAlign: 'center',
                    fontSize: '1.1em',
                    transition: 'all 0.3s ease'
                  }}>
                    {isReceiverRevealed ? link.receiver : '???'}
                  </span>
                </li>
              )
            })}
          </ul>
          
          {step >= chain.length - 0.5 && (
            <p style={{textAlign: 'center', marginTop: '2rem', color: '#F37021', fontWeight: 'bold', fontSize: '1.2em'}}>
              All pairs revealed! 🎉
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default AdminPage
