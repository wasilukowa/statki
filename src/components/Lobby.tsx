import { useState } from 'react'
import { supabase, ensureAnonymousSession } from '../lib/supabase'

type Props = {
  pendingGameId: string | null
  onGameCreated: (gameId: string) => void
  onGameJoined: (gameId: string) => void
}

type Phase = 'idle' | 'creating' | 'joining'

function generateCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}


export default function Lobby({ pendingGameId, onGameCreated, onGameJoined }: Props) {
  const [nickname, setNickname] = useState(() => sessionStorage.getItem('nickname') ?? '')
  const [joinCode, setJoinCode] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    const name = nickname.trim()
    if (!name) return
    sessionStorage.setItem('nickname', name)
    setError(null)
    setPhase('creating')

    const playerId = await ensureAnonymousSession()
    const code = generateCode()
    const { data: game, error: gameError } = await supabase
      .from('games')
      .insert({ player1_id: playerId, code, status: 'waiting' })
      .select('id, code')
      .single()

    if (gameError || !game) {
      setError('Nie udało się stworzyć gry.')
      setPhase('idle')
      return
    }

    // Zapisuje kod dla ekranu oczekiwania, przekazuje gameId do App.tsx
    sessionStorage.setItem(`game-code:${game.id}`, game.code)
    onGameCreated(game.id)
    setPhase('idle')
  }

  async function handleJoin() {
    const name = nickname.trim()
    const code = joinCode.trim().toUpperCase()
    if (!name || !code) return
    sessionStorage.setItem('nickname', name)
    setError(null)
    setPhase('joining')

    const playerId = await ensureAnonymousSession()

    const { data: game, error: findError } = await supabase
      .from('games')
      .select('id')
      .eq('code', code)
      .eq('status', 'waiting')
      .single()

    if (findError || !game) {
      setError('Nie znaleziono gry o takim kodzie.')
      setPhase('idle')
      return
    }

    const { error: updateError } = await supabase
      .from('games')
      .update({ player2_id: playerId, status: 'placing' })
      .eq('id', game.id)

    if (updateError) {
      setError('Nie udało się dołączyć do gry.')
      setPhase('idle')
      return
    }

    // Gracz 2 przechodzi od razu — to on wywołał zmianę statusu
    onGameJoined(game.id)
  }

  const nicknameOk = nickname.trim().length > 0
  const busy = phase === 'creating' || phase === 'joining'

  // Ekran oczekiwania — gracz 1 stworzył grę, czeka na gracza 2
  if (pendingGameId) {
    // Znajdź kod gry z sessionStorage lub pokaż loader
    const displayCode = sessionStorage.getItem(`game-code:${pendingGameId}`) ?? '…'
    return (
      <div className="h-full overflow-y-auto bg-gray-900 flex flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-4xl font-bold text-white">Statki</h1>
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-4 w-full max-w-xs">
          <p className="text-gray-400 text-sm">Gra utworzona! Podziel się kodem:</p>
          <div className="bg-gray-900 rounded-xl px-6 py-4 text-center">
            <span className="text-3xl font-mono font-bold tracking-widest text-yellow-300">
              {displayCode}
            </span>
          </div>
          <p className="text-gray-500 text-xs text-center">
            Oczekiwanie na drugiego gracza…
          </p>
          <div className="flex gap-1 mt-1">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-900 flex flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-4xl font-bold text-white">Statki</h1>

      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 flex flex-col gap-6 w-full max-w-xs">

        {/* Pseudonim */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-300">Pseudonim</label>
          <input
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && nicknameOk && !busy && handleCreate()}
            placeholder="Wpisz pseudonim…"
            maxLength={20}
            className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-400 transition-colors"
          />
        </div>

        {/* Stwórz grę */}
        <button
          disabled={!nicknameOk || busy}
          onClick={handleCreate}
          className={`
            w-full py-2.5 rounded-lg font-bold text-sm transition-all
            ${nicknameOk && !busy
              ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {phase === 'creating' ? 'Tworzenie…' : 'Stwórz grę'}
        </button>

        {/* Separator */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-gray-600 text-xs">lub</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>

        {/* Dołącz do gry */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-300">Kod pokoju</label>
          <input
            type="text"
            inputMode="numeric"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && nicknameOk && joinCode.length === 6 && !busy && handleJoin()}
            placeholder="000000"
            maxLength={6}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-600 font-mono tracking-widest focus:outline-none focus:border-blue-400 transition-colors"
          />
          <button
            disabled={!nicknameOk || joinCode.length !== 6 || busy}
            onClick={handleJoin}
            className={`
              w-full py-2.5 rounded-lg font-bold text-sm transition-all
              ${nicknameOk && joinCode.length === 6 && !busy
                ? 'bg-green-600 hover:bg-green-500 text-white cursor-pointer'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            {phase === 'joining' ? 'Dołączanie…' : 'Dołącz do gry'}
          </button>
        </div>

        {/* Błąd */}
        <div className="h-4 flex items-center">
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      </div>
    </div>
  )
}
