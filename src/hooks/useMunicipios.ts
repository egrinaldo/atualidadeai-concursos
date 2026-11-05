import { useEffect, useState } from 'react'

type State = { status: 'idle' | 'loading' | 'ready' | 'error'; cities: string[] }

const cache = new Map<string, string[]>()

/**
 * Carrega a lista de municípios da UF a partir de /data/municipios/{UF}.json
 * (gerado a partir da base oficial do IBGE e servido pelo próprio site).
 * Em caso de falha, o formulário permite digitar a cidade livremente.
 */
export function useMunicipios(uf: string): State {
  const [state, setState] = useState<State>({ status: 'idle', cities: [] })

  useEffect(() => {
    if (!uf) {
      setState({ status: 'idle', cities: [] })
      return
    }
    const cached = cache.get(uf)
    if (cached) {
      setState({ status: 'ready', cities: cached })
      return
    }
    let active = true
    setState({ status: 'loading', cities: [] })
    fetch(`/data/municipios/${uf}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : Promise.reject(new Error(String(r.status)))))
      .then((cities) => {
        cache.set(uf, cities)
        if (active) setState({ status: 'ready', cities })
      })
      .catch(() => active && setState({ status: 'error', cities: [] }))
    return () => {
      active = false
    }
  }, [uf])

  return state
}
