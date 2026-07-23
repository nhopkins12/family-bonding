export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined

  function debounced(...args: Args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delayMs)
  }

  debounced.cancel = () => {
    if (timer) clearTimeout(timer)
  }

  return debounced
}
