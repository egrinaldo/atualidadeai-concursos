type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/**
 * Busca todas as linhas em páginas (a API do Supabase devolve no máximo 1.000 por consulta e corta o resto
 * sem avisar). A consulta precisa ter ordenação estável (ex.: .order('id')).
 */
export async function selectAll<T>(page: (from: number, to: number) => Page<T>, opts: { pageSize?: number; max?: number } = {}): Promise<T[]> {
  const size = opts.pageSize ?? 1000
  const max = opts.max ?? 20_000
  const out: T[] = []
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, Math.min(from + size, max) - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < size) break
  }
  return out
}
